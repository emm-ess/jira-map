import fs from 'node:fs'
import type {DataRaw} from '../types/data-raw.ts'
import type {Data} from '../types/data.ts'
import {
    getJsonFilesOfDirectory,
    dataDir,
    readJsonFile,
    writeArray,
    writeMap,
    readMap,
    additionalDataDir,
} from './util.ts'

// scrapping the data via this script was planned but the instance doesn't allow it. So it's manually downloaded
// files and a script for data reduction/extraction

const MENTION_REGEX = /\[~([^\]]+)]/g
const SPRINT_REGEX = /^com\.atlassian\.greenhopper\.service\.sprint\.Sprint@.+?\[activatedDate=(.*?),autoStartStop=(?:true|false),completeDate=(.*?),endDate=(.*?),goal=(.*?),id=(\d+),incompleteIssuesDestinationId=<null>,name=(.*?),rapidViewId=\d+,sequence=(\d+),startDate=(.*?),state=(.*?),synced=(?:true|false)\]$/

const user = new Map<string, Data.User>()
const sprints = new Map<string, Data.Sprint>()
const components = new Map<string, Data.Component>()
const issueLinkTypes = new Map<string, Data.IssueLinkType>()
const links = new Map<string, Data.IssueLink>()
const statuses = new Map<string, Data.Status>()
const issueType = new Map<string, Data.IssueType>()
const issues = new Map<string, Data.Issue>()

/** key: subtask id, value: parent id */
const subtasksMap = new Map<string, string>()
const subtasksList = new Map<string, Data.Issue>()
const subtasksLinks = new Map<string, Data.IssueLink>()

const userMeta = readMap<UserMetaData>('userMeta.json', additionalDataDir)
const userReplacements = new Map<string, string>(
    userMeta.values()
        .filter((entry) => entry.combine && entry.combine.length > 1)
        .flatMap((entry) => {
            const mainKey = entry.combine![0]
            return entry.combine!.slice(1).map((key) => [key, mainKey])
        })
)

function processSprintString(sprintStrings: DataRaw.SprintString[] | null): string[] | undefined {
    if (!sprintStrings?.length) {
        return
    }

    return sprintStrings.map((rawSprint) => {
        const match = rawSprint.match(SPRINT_REGEX)

        if (match === null || match.length !== 10) {
            throw new Error(`Invalid sprint string: ${rawSprint}`)
        }

        const id = match[5] as string

        const sprint = {
            id,
            activatedDate: match[1] as string,
            completeDate: match[2] as string,
            endDate: match[3] as string,
            goal: match[4] as string,
            name: match[6] as string,
            sequence: Number(match[7]),
            startDate: match[8] as string,
            state: match[9] as string,
        }

        for (const key in sprint) {
            if (sprint[key] === '<null>') {
                delete sprint[key]
            }
        }

        sprints.set(id, sprint)

        return id
    })
}

function processUser<T extends DataRaw.User | undefined | null>(rawUser: T): T extends DataRaw.User ? string : undefined {
    if (!rawUser) {
        return
    }

    const key = rawUser.key
    user.set(key, {
        key,
        name: rawUser.name,
        avatarUrls: rawUser.avatarUrls,
        displayName: rawUser.displayName,
    })

    // return key for main user
    return userReplacements.has(key)
        ? userReplacements.get(key)
        : key
}

function processComponent(rawComponent: DataRaw.ProjectComponent): string {
    components.set(rawComponent.id, {
        id: rawComponent.id,
        name: rawComponent.name,
    })

    return rawComponent.id
}

function processIssueType(rawIssueType: DataRaw.IssueType): string {
    issueType.set(rawIssueType.id, {
        id: rawIssueType.id,
        name: rawIssueType.name,
        subtask: rawIssueType.subtask,
    })

    return rawIssueType.id
}

function processStatus(rawStatus: DataRaw.Status): string {
    const id = rawStatus.id
    statuses.set(id, {
        id,
        description: rawStatus.description,
        name: rawStatus.name,
        statusCategory: {
            colorName: rawStatus.statusCategory.colorName,
            id: rawStatus.statusCategory.id,
            key: rawStatus.statusCategory.key,
            name: rawStatus.statusCategory.name,
        },
    })

    return id
}

function processLinkedIssue(rawLinkedIssue: DataRaw.LinkedIssue): Data.LinkedIssue {
    processStatus(rawLinkedIssue.fields.status)

    return {
        id: rawLinkedIssue.id,
        issuetype: processIssueType(rawLinkedIssue.fields.issuetype),
    }
}

function processIssueLinkType(rawIssueLinkType: DataRaw.IssueLinkType): string {
    const id = rawIssueLinkType.id
    issueLinkTypes.set(id, {
        id,
        name: rawIssueLinkType.name,
        inward: rawIssueLinkType.inward,
        outward: rawIssueLinkType.outward,
    })

    return id
}

function processIssueLink(rawIssueLink: DataRaw.IssueLink): string {
    const id = rawIssueLink.id

    const issueLink: Data.IssueLink = links.get(id) ?? {
        id,
        type: processIssueLinkType(rawIssueLink.type),
    }

    if (rawIssueLink.inwardIssue) {
        issueLink.inwardIssue = processLinkedIssue(rawIssueLink.inwardIssue)
    }

    if (rawIssueLink.outwardIssue) {
        issueLink.outwardIssue = processLinkedIssue(rawIssueLink.outwardIssue)
    }

    links.set(issueLink.id, issueLink)

    return issueLink.id
}

function processComment(rawComment: DataRaw.Comment): Data.Comment {
    const mentionedUsers = [...rawComment.body.matchAll(MENTION_REGEX)]
        .map((match) => match[0].slice(2, -1))
    return {
        id: rawComment.id,
        body: rawComment.body,
        author: processUser(rawComment.author),
        created: rawComment.created,
        updated: rawComment.updated,
        updateAuthor: processUser(rawComment.updateAuthor),
        mentionedUsers,
    } as Data.Comment
}

const fieldsWithUserChange = ['assignee', 'reporter']
function processHistoryItems(items: DataRaw.IssueChangelogHistoryItem[]): DataRaw.IssueChangelogHistoryItem[] {
    return items.map((item) => {
        if (fieldsWithUserChange.includes(item.field)) {
            // yes, that's quick and dirty, but good enough for the purpose. We only care for the id anyways
            item.from = item.from && (userReplacements.get(item.from) || item.from)
            item.to = item.to && (userReplacements.get(item.to) || item.to)
        }
        return item
    })
}

function processChangelog(rawChangelog: DataRaw.IssueChangelog): Data.IssueChangelogHistory[] {
    return rawChangelog.histories.map((history) => ({
        id: history.id,
        author: processUser(history.author),
        created: history.created,
        items: processHistoryItems(history.items),
    }))
}

function processAssignedUsers(changelog: Data.IssueChangelogHistory[], currentAssignee?: string): string[] {
    const assignedUsers = changelog.flatMap((history) =>
        history.items
            .filter((item) => item.field === 'assignee')
            .flatMap((item) => [item.from, item.to]),
        )
        // since the `to`-user becomes the next `from`-user, we filter those repetitions
        .filter((user, index, array) => {
            return !(!user || (index !== 0 && user !== array[index - 1]))
        })

    if (currentAssignee) {
        assignedUsers.unshift(currentAssignee)
    }

    return assignedUsers
}

const REST_REGEX = /\(Rest[: ]*[^\)]*\)/ig
function processIssue(issue: DataRaw.Issue): Data.Issue {
    const assignee = processUser(issue.fields.assignee)
    const changelog = processChangelog(issue.changelog)
    const comments = issue.fields.comment.comments.map(processComment)

    const subtasks = issue.fields.subtasks.map((subtask) => {
        subtasksMap.set(subtask.id, issue.id)
        processLinkedIssue(subtask)
        return subtask.id
    })

    const assignedUsers = processAssignedUsers(changelog, assignee)
    const assignedUsersUnique = [...new Set(assignedUsers)]
    const mentionedUsers = comments.flatMap((comment) => comment.mentionedUsers)
    const mentionedUsersUnique = [...new Set(mentionedUsers)]

    const processedIssue: Data.Issue = {
        id: issue.id,
        key: issue.key,
        assignee,
        assignedUsers,
        assignedUsersUnique,
        mentionedUsers,
        mentionedUsersUnique,
        sprints: processSprintString(issue.fields.customfield_10005),
        summary: issue.fields.summary.replaceAll(REST_REGEX, '').trim(),
        issuetype: processIssueType(issue.fields.issuetype),
        lastViewed: issue.fields.lastViewed,
        components: issue.fields.components.map(processComponent),
        created: issue.fields.created,
        description: issue.fields.description,
        reporter: processUser(issue.fields.reporter),
        issuelinks: issue.fields.issuelinks.map(processIssueLink),
        updated: issue.fields.updated,
        status: processStatus(issue.fields.status),
        comments,
        changelog,
        subtasks,
    }

    if (issue.fields.customfield_10002 !== null) {
        processedIssue.storypoints = Math.round(issue.fields.customfield_10002)
    }

    issues.set(issue.id, processedIssue)

    return processedIssue
}

function filterSubtasks(): void {
    for (const [subtaskId, parentId] of subtasksMap) {
        const parent = issues.get(parentId)
        const subtask = issues.get(subtaskId)

        if (!parent || !subtask) {
            if (!parent) {
                console.error(`Parent ${parentId} not found`)
            }
            if (!subtask) {
                console.error(`Subtask ${subtaskId} not found`)
            }
            continue
        }

        issues.delete(subtaskId)
        subtasksList.set(subtaskId, subtask)

        subtask.issuelinks.forEach((linkId) => {
            const link = links.get(linkId)
            if (!link) {
                return
            }
            subtasksLinks.set(linkId, {...link})

            if (link.inwardIssue?.id === subtask.id) {
                link.inwardIssue.id = parent.id
                link.inwardIssue.issuetype = parent.issuetype
            }
            if (link.outwardIssue?.id === subtask.id) {
                link.outwardIssue.id = parent.id
                link.outwardIssue.issuetype = parent.issuetype
            }

            if (link.inwardIssue?.id === link.outwardIssue?.id) {
                links.delete(linkId)
                const index = parent.issuelinks.indexOf(linkId)
                if (index !== -1) {
                    parent.issuelinks.splice(index, 1)
                }
            }
            else if (!parent.issuelinks.includes(linkId)) {
                parent.issuelinks.push(linkId)
            }
        })

        parent.comments.push(...subtask.comments.map((comment) => ({
            ...comment,
            fromFormerSubtask: subtask.id,
        })))
        parent.changelog.push(...subtask.changelog.map((history) => ({
            ...history,
            fromFormerSubtask: subtask.id,
        })))
        parent.assignedUsers.push(...subtask.assignedUsers)
        parent.assignedUsersUnique = [...new Set(parent.assignedUsers)]
        parent.mentionedUsers.push(...subtask.mentionedUsers)
        parent.mentionedUsersUnique = [...new Set(parent.mentionedUsers)]
    }
}

const POLISHING_TASKS_REGEX = /^Nacharbeiten.*Sprint.*\d{1,3}$/i
function filterPolishingTickets(): void {
    let countDeletedPolishingTasks = 0
    for (const issue of issues.values()) {
        if (POLISHING_TASKS_REGEX.test(issue.summary)) {
            countDeletedPolishingTasks++
            issues.delete(issue.id)
            for (const subtask of issue.subtasks) {
                issues.delete(subtask)
                subtasksMap.delete(subtask)
            }
        }
    }
    console.log(`Deleted ${countDeletedPolishingTasks} polishing tickets`)
}

function applyIssueMeta(): void {
    const issueMeta = readMap<{hide?: boolean}>('issueMeta.json', additionalDataDir)
    for (const [issueId, meta] of issueMeta) {
        if (meta.hide) {
            issues.delete(issueId)
            subtasksMap.delete(issueId)
        }
    }
}

function fixIssueLinks(linkMap: Map<string, Data.IssueLink>, issueMap: Map<string, Data.Issue>): void {
    const deletedIssueLinks = new Set<string>()
    for (const [linkId, link] of linkMap) {
        if (link.inwardIssue?.id === link.outwardIssue?.id
            || !link.inwardIssue
            || !link.outwardIssue
            || (!issueMap.has(link.inwardIssue.id) && !issueMap.has(link.outwardIssue.id))
        ) {
            deletedIssueLinks.add(linkId)
        }
    }
    for (const linkId of deletedIssueLinks) {
        linkMap.delete(linkId)
        for (const issue of issueMap.values()) {
            issue.issuelinks = issue.issuelinks.filter((id) => id !== linkId)
        }
    }
    console.log(`Deleted ${deletedIssueLinks.size} issue links`)
}

function fixMentionedUsers() {
    const traversedUsers = new Map(user.values().map((user) => [
        user.name,
        userReplacements.get(user.key) || user.key,
    ]))
    function traverseUser(users: string[]): string[] {
        return users.map((user) => traversedUsers.get(user) || user)
    }

    issues.forEach((issue) => {
        issue.mentionedUsers = traverseUser(issue.mentionedUsers)
        issue.comments.forEach((comment) => {
            comment.mentionedUsers = traverseUser(comment.mentionedUsers)
        })
    })
}

type UserMetaData = {
    hide?: boolean
    combine?: string[]
    displayName?: string
}

function fixUser() {
    user.values().forEach((userEntry) => {
        const meta = userMeta.get(userEntry.key)
        if (meta?.hide || userReplacements.has(userEntry.key)) {
            user.delete(userEntry.key)
            return
        }

        if (meta?.displayName) {
            userEntry.displayName = meta.displayName
        }

        if (userEntry.displayName.endsWith(' [X]')) {
            userEntry.displayName = userEntry.displayName.slice(0, -4)
        }
    })
}

async function main() {
    const files = getJsonFilesOfDirectory()

    for (const dirent of files) {
        process.stdout.write(`\r${dirent.name}`)
        const content = readJsonFile<DataRaw.File>(dirent.name)
        content.issues.forEach((issue) => {
            process.stdout.write(`\r${issue.key}`)
            processIssue(issue)
        })
        process.stdout.write(`\r${dirent.name} done`)
    }
    process.stdout.write('\n')

    fixMentionedUsers()
    fixUser()
    filterSubtasks()
    filterPolishingTickets()
    applyIssueMeta()
    fixIssueLinks(links, issues)
    fixIssueLinks(subtasksLinks, subtasksList)

    writeMap(user, 'users')
    writeMap(sprints, 'sprints')
    writeMap(components, 'components')
    writeMap(issueLinkTypes, 'issueLinkTypes')
    writeMap(links, 'links')
    writeMap(statuses, 'statuses')
    writeMap(issueType, 'types')
    writeMap(issues, 'issues')
    writeMap(subtasksList, 'subtasks')
    writeMap(subtasksLinks, 'subtasksLinks')
}

main()
