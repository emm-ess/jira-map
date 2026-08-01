import fs from 'node:fs'
import {checkbox, confirm, expand, input, select} from '@inquirer/prompts'
import type {DataAdditional} from '../types/data-additional.ts'
import type {Data} from '../types/data.ts'
import {additionalDataDir, dataDir, readMap, writeMap} from './util.ts'

const userDefinedPredictions = readMap<string[]>('predictionMeta.json', additionalDataDir)

const issues = readMap<Data.Issue>('issues.json', dataDir)
const users = readMap<Data.User>('users.json', dataDir)
const issueTypes = readMap<Data.IssueType>('types.json', dataDir)
const issueLinks = readMap<Data.IssueLink>('links.json', dataDir)
const issueLinkTypes = readMap<Data.IssueLinkType>('issueLinkTypes.json', dataDir)
const statuses = readMap<Data.Status>('statuses.json', dataDir)
const components = readMap<Data.Component>('components.json', dataDir)
const sprints = readMap<Data.Sprint>('sprints.json', dataDir)

// normalize
for (const [keyword, areas] of [...userDefinedPredictions.entries()]) {
    userDefinedPredictions.delete(keyword)
    userDefinedPredictions.set(normalized(keyword), unique(areas))
}

const newStates = statuses.values()
    .filter((state) => state.statusCategory.key === 'new')
    .map<string>((state) => state.id)
    .toArray()
const closedStates = statuses.values()
    .filter((state) => state.statusCategory.key === 'done')
    .map<string>((state) => state.id)
    .toArray()

const componentLookup = new Map(components.entries().map(([id, component]) => [normalized(component.name), id]))

let editedIssues = 0
const skippedDuplicateIssues = new Set<string>()

const userAddedInformation = readMap<DataAdditional.IssueMeta>('issueMeta.json', additionalDataDir)
const alreadyKnownAreas = new Map(userAddedInformation.values()
    .flatMap((metadata) => metadata.area ?? [])
    .map((area) => [normalized(area), area])
)

function unique(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function userName(key: string): string {
    return users.get(key)?.displayName ?? key
}

function clearScreen(): void {
    process.stdout.write('\u001b[2J\u001b[H')
}

function getLinkedIssues(issue: Data.Issue): Data.Issue[] {
    const linkedIds = issue.issuelinks.flatMap((linkId) => {
        const link = issueLinks.get(linkId)
        return [link?.inwardIssue?.id, link?.outwardIssue?.id]
    }).filter((id): id is string => Boolean(id) && id !== issue.id)

    return unique(linkedIds)
        .map((id) => issues.get(id))
        .filter((linkedIssue): linkedIssue is Data.Issue => Boolean(linkedIssue))
}

function normalized(value: string): string {
    return value.trim().toLocaleLowerCase()
}

function predictions(issue: Data.Issue, current: DataAdditional.IssueMeta) {
    const linkedIssues = getLinkedIssues(issue)
    const componentPredictions = new Set<string>()
    const areaPredictions = new Set<string>()
    const allSummariesString = [
        normalized(issue.summary),
        ...linkedIssues.map((linkedIssue) => normalized(linkedIssue.summary)),
    ].join(' | ')

    linkedIssues.forEach((linkedIssue) => {
        linkedIssue.components.forEach((componentId) => {
            componentPredictions.add(componentId)
        })

        const metadata = userAddedInformation.get(linkedIssue.id)
        metadata?.area?.forEach((area) => {
            areaPredictions.add(area)
        })
    })

    componentLookup.entries().forEach(([name, id]) => {
        if (allSummariesString.includes(name)) {
            componentPredictions.add(id)
        }
    })
    userDefinedPredictions.entries().forEach(([keyword, predictedAreas]) => {
        if (allSummariesString.includes(keyword)) {
            for (const predictedArea of predictedAreas) {
                areaPredictions.add(predictedArea)
            }
        }
    })
    alreadyKnownAreas.entries().forEach(([normalizedArea, readableArea]) => {
        if (allSummariesString.includes(normalizedArea)) {
            areaPredictions.add(readableArea)
        }
    })

    const predictedComponents = [...componentPredictions.values()]
        .filter((componentId) => !current.components?.includes(componentId))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 8)

    const predictedAreas = [...areaPredictions.values()]
        .filter((area) => !current.area?.includes(area))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 8)

    return {linked: linkedIssues, predictedComponents, predictedAreas}
}

function wasIssueDirectlyClosed(issue: Data.Issue): boolean {
    return closedStates.includes(issue.status) && !!issue.changelog.filter((change) => {
        return change.items.some((item) => {
            return item.field === 'status' && newStates.includes(item.from) && closedStates.includes(item.to)
        })
    })?.length
}

function printIssue(issue: Data.Issue, linked: Data.Issue[], alreadyEdited: boolean): void {
    const type = issueTypes.get(issue.issuetype)?.name ?? issue.issuetype
    const status = statuses.get(issue.status)?.name ?? issue.status
    const componentNames = issue.components
        .map((componentId) => components.get(componentId)?.name ?? componentId)
    const sprintNames = issue.sprints
        ?.map((sprintId) => sprints.get(sprintId)?.name ?? sprintId)
    const linkedSummaries = issue.issuelinks.flatMap((linkId) => {
        const link = issueLinks.get(linkId)
        const linkedIssue = linked.find((candidate) =>
            candidate.id === link?.inwardIssue?.id || candidate.id === link?.outwardIssue?.id)
        if (!linkedIssue) {
            return []
        }
        const linkType = link?.type ? issueLinkTypes.get(link.type)?.name ?? link.type : 'link'
        return `${linkedIssue.key} (${linkType}): ${linkedIssue.summary}`
    })

    const directlyClosed = wasIssueDirectlyClosed(issue)

    console.log(`\n == Ticket ${editedIssues} of ${issues.size} ` + '='.repeat(45))
    console.log(`\n${issue.key} | ${type} | ${status}${alreadyEdited ? ' | [already edited]' : ''}`)
    console.log('\n' + issue.summary)
    console.log(`\n${issue.description || '(none)'}`)
    console.log(`\nReporter: ${userName(issue.reporter) || '(unknown)'}`)
    console.log(`Assignee(s): ${issue.assignedUsersUnique.map(userName).join(', ') || '(none)'}`)
    console.log(`Mentioned user(s): ${issue.mentionedUsersUnique.map(userName).join(', ') || '(none)'}`)
    console.log(`Components: ${componentNames.join(', ') || '(none)'}`)
    console.log(`Sprint(s): ${sprintNames?.join(', ') || '(none)'}`)
    console.log(`Linked issue(s): ${linkedSummaries.join(' | ') || '(none)'}`)
    console.log(`\nDirectly closed: ${directlyClosed ? '--> yes!' : 'no'}\n`)
}

function getComponentChoices(currentComponents: string[], predictedComponents: string[]) {
    return [...components.values()]
        .sort((componentA, componentB) => {
            const priority = (componentId: string) =>
                Number(currentComponents.includes(componentId)) * 2
                + Number(predictedComponents.includes(componentId))
            const priorityOrder = priority(componentB.id) - priority(componentA.id)
            return priorityOrder || componentA.name.localeCompare(componentB.name)
        })
        .map((component) => ({
            name: `${component.name}${predictedComponents.includes(component.id) ? ' [predicted]' : ''}`,
            value: component.id,
            checked: currentComponents.includes(component.id) || predictedComponents.includes(component.id),
        }))
}

function getAreaChoices(currentArea: string[], predictedAreas: string[]) {
    return unique([
        ...alreadyKnownAreas.values(),
        ...currentArea,
        ...predictedAreas,
    ]).sort((areaA, areaB) => {
        const priority = (area: string) =>
            Number(currentArea?.includes(area)) * 2
            + Number(predictedAreas.includes(area))
        const priorityOrder = priority(areaB) - priority(areaA)
        return priorityOrder || areaA.localeCompare(areaB)
    }).map((area) => ({
        name: `${area}${predictedAreas.includes(area) ? ' [predicted]' : ''}`,
        value: area,
        checked: currentArea?.includes(area) || predictedAreas.includes(area),
    }))
}

async function collectMetadata(issue: Data.Issue): Promise<DataAdditional.IssueMeta | 'unedited' | undefined> {
    const current = userAddedInformation.get(issue.id) ?? {}
    const {linked, predictedComponents, predictedAreas} = predictions(issue, current)
    clearScreen()
    printIssue(issue, linked, userAddedInformation.has(issue.id))

    const action = await expand({
        message: 'Action (Enter edit, h hide, s skip, u next unedited)',
        expanded: true,
        default: 'e',
        choices: [
            {key: 'h', name: 'Hide ticket', value: 'hide'},
            {key: 's', name: 'Skip ticket', value: 'skip'},
            {key: 'u', name: 'Skip to next unedited ticket', value: 'unedited'},
            {key: 'e', name: 'Edit metadata (default)', value: 'edit'},
        ],
    })

    if (action === 'unedited') {
        return action
    }
    if (action === 'skip') {
        return
    }
    if (action === 'hide') {
        return {hide: true}
    }

    const componentChoices = getComponentChoices(
        current.components ?? issue.components,
        predictedComponents,
    )

    const selectedComponents = await checkbox({
        message: 'Components (predictions are marked [predicted])',
        choices: componentChoices,
        pageSize: 15,
    })

    const areaChoices = getAreaChoices(
        current.area ?? [],
        predictedAreas,
    )
    const selectedAreas = areaChoices.length > 0
        ? await checkbox({
            message: 'Known areas (predictions are marked [predicted])',
            choices: areaChoices,
            pageSize: 15,
        })
        : []

    if (predictedAreas.length > 0 && !current.area?.length) {
        console.log(`Areas selected by prediction [predicted]: ${predictedAreas.join(', ')}`)
    }
    const areaText = await input({
        message: 'Additional new areas (comma-separated)',
    })

    return {
        ...current,
        components: selectedComponents,
        area: unique([...selectedAreas, ...areaText.split(',')]),
    }
}

async function detectDuplicates(issue: Data.Issue): Promise<boolean | void> {
    if (skippedDuplicateIssues.has(issue.id)) {
        return
    }

    const existingMetadata = userAddedInformation.get(issue.id)
    if (existingMetadata?.duplicateOf) {
        issues.delete(issue.id)
        return
    }
    if (existingMetadata?.duplicatedBy) {
        existingMetadata.duplicatedBy.forEach((duplicateId) => issues.delete(duplicateId))
        return
    }

    const duplicateLinkType = [...issueLinkTypes.values()]
        .find((linkType) => normalized(linkType.name) === 'duplicate')
    if (!duplicateLinkType) {
        return
    }

    const duplicateIssues = new Map<string, Data.Issue>()
    const pendingIds = [issue.id]
    while (pendingIds.length > 0) {
        const currentId = pendingIds.pop()
        if (!currentId || duplicateIssues.has(currentId)) {
            continue
        }

        const currentIssue = issues.get(currentId)
        if (!currentIssue) {
            continue
        }
        duplicateIssues.set(currentId, currentIssue)

        currentIssue.issuelinks.forEach((linkId) => {
            const link = issueLinks.get(linkId)
            if (link?.type !== duplicateLinkType.id) {
                return
            }

            const linkedId = link.inwardIssue?.id === currentId
                ? link.outwardIssue?.id
                : link.inwardIssue?.id
            if (linkedId) {
                pendingIds.push(linkedId)
            }
        })
    }

    if (duplicateIssues.size < 2) {
        return
    }

    const duplicateGroup = [...duplicateIssues.values()]
    clearScreen()
    console.log('\nPotential duplicate group:')
    duplicateGroup.forEach((candidate) => {
        console.log(`${candidate.key}: ${candidate.summary}`)
    })

    const shouldDeduplicate = await confirm({
        message: 'Deduplicate this group?',
        default: true,
    })
    if (!shouldDeduplicate) {
        duplicateGroup.forEach((candidate) => skippedDuplicateIssues.add(candidate.id))
        return
    }

    const mainIssueId = await select({
        message: 'Which ticket should remain as the main ticket?',
        choices: duplicateGroup.map((candidate) => ({
            name: `${candidate.key}: ${candidate.summary}`,
            value: candidate.id,
        })),
    })

    const duplicateIds = duplicateGroup
        .map((candidate) => candidate.id)
        .filter((candidateId) => candidateId !== mainIssueId)
    const mainMetadata = userAddedInformation.get(mainIssueId) ?? {}

    const mergedMetadata: DataAdditional.IssueMeta = {
        ...mainMetadata,
        duplicatedBy: unique([
            ...(mainMetadata.duplicatedBy ?? []),
            ...duplicateIds,
        ]),
    }
    userAddedInformation.set(mainIssueId, mergedMetadata)

    duplicateIds.forEach((duplicateId) => {
        userAddedInformation.set(duplicateId, {
            ...userAddedInformation.get(duplicateId),
            hide: true,
            duplicateOf: mainIssueId,
        })
        // issues.delete(duplicateId)
    })

    return true
}

async function main(): Promise<void> {
    fs.mkdirSync(additionalDataDir, {recursive: true})

    const originalIssueCount = issues.size
    for (const issue of issues.values()) {
        const deduplicated = await detectDuplicates(issue)
        if (deduplicated) {
            writeMap(userAddedInformation, 'issueMeta', additionalDataDir)
        }
    }
    console.log(`\n${originalIssueCount - issues.size} issues removed as duplicates.`)

    let skipEdited = false
    for (const issue of issues.values()) {
        editedIssues++
        const metaEntry = userAddedInformation.get(issue.id)
        if (metaEntry?.hide
            || (skipEdited && metaEntry && Object.keys(metaEntry).some((key) => !key.startsWith('duplicate')))) {
            continue
        }

        const metadata = await collectMetadata(issue)
        if (!metadata) {
            continue
        }
        else if (metadata === 'unedited') {
            skipEdited = true
            continue
        }
        userAddedInformation.set(issue.id, metadata)
        metadata.area?.forEach((area) => alreadyKnownAreas.set(normalized(area), area))
        writeMap(userAddedInformation, 'issueMeta', additionalDataDir)
        skipEdited = false
    }
}

await main()
