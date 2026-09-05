import type {ElementDefinition} from 'cytoscape'

import {AreaGraph} from '../src/graph/areaGraph.ts'
import type {Data} from '../types/data.ts'
import type {DataAdditional} from '../types/data-additional.d.ts'
import type {DataPrepared} from '../types/data-prepared.ts'
import {AVAILABLE_EDGES, AVAILABLE_NODE_TYPES, EDGE_TYPE, NODE_TYPE} from './const.ts'
import type {CommentMentions} from './evaluateData.ts'
import {
    additionalDataDir,
    dataDir,
    preparedDataDir,
    readArray,
    readJsonFile,
    readMap,
    unique,
    writeArray, writeMap,
} from './util.ts'

// additional user-provided data
const issueMeta = readMap<string, DataAdditional.IssueMeta>('issueMeta.json', additionalDataDir)

// exported & normalized data from jira
const users = readMap<string, Data.User>('users.json', dataDir)
const issueTypes = readMap<string, Data.IssueType>('types.json', dataDir)
const sprints = readMap<string, Data.Sprint>('sprints.json', dataDir, true)
const issues = readMap<string, Data.Issue>('issues.json', dataDir)
const components = readMap<string, Data.Component>('components.json', dataDir)

function applyMetaData(): void {
    for (const issueId of issues.keys()) {
        if (issueMeta.get(issueId)?.hide) {
            issues.delete(issueId)
        }
    }
}

/* ****************+
 * HElPER
 *******************/

function normalizeFilename(name: string): string {
    return name.toLowerCase()
        .replaceAll(' ', '-')
        .replaceAll('ä', 'ae')
        .replaceAll('ö', 'oe')
        .replaceAll('ü', 'ue')
}

/* ****************+
 * "raw" data
 *******************/

function writeIssues(): void {
    const preparedIssues = new Map<string, DataPrepared.Issue>()
    for (const [id, issue] of issues.entries()) {
        const {changelog, ...rest} = issue
        const preparedIssue: DataPrepared.Issue = {
            ...rest,
            area: issueMeta.get(issue.id)?.area,
            components: issueMeta.get(issue.id)?.components ?? issue.components,
        }
        preparedIssues.set(id, preparedIssue)
    }
    writeMap(preparedIssues, 'data/issues', preparedDataDir)
}

function writeRawData(): void {
    writeIssues()
    writeMap(users, 'data/users', preparedDataDir)
    writeMap(sprints, 'data/sprints', preparedDataDir)
    writeMap(issueTypes, 'data/issueTypes', preparedDataDir)
    writeMap(components, 'data/components', preparedDataDir)
}

/* ****************+
 * NODES
 *******************/

export type UserData = {
    type: 'user'
    id: string
    displayName: string
}

function createUserNodes(): void {
    const usersForCytoscape = users.values()
        .map<ElementDefinition>((user) => ({
            group: 'nodes',
            data: {
                type: NODE_TYPE.USER,
                id: user.key,
                displayName: user.displayName,
            } as const satisfies UserData,
        }))
        .toArray()
    writeArray(usersForCytoscape, AVAILABLE_NODE_TYPES.USER.filename, preparedDataDir)
}

function createComponentNodes(): void {
    const preparedComponents = components.values()
        .map<ElementDefinition>((component) => ({
            group: 'nodes',
            data: {
                type: NODE_TYPE.COMPONENT,
                ...component,
            },
        }))
        .toArray()
    writeArray(preparedComponents, AVAILABLE_NODE_TYPES.COMPONENT.filename, preparedDataDir)
}

function createSprintNodes(): void {
    const simplifiedSprints = sprints.values()
        .map<ElementDefinition>((sprint) => ({
            group: 'nodes',
            data: {
                type: NODE_TYPE.SPRINT,
                id: sprint.id.toString(),
            },
        }))
        .toArray()
    writeArray(simplifiedSprints, AVAILABLE_NODE_TYPES.SPRINT.filename, preparedDataDir)
}

function createIssueNodes(): void {
    const simplifiedIssues = issues.values()
        .map<ElementDefinition>((issue) => ({
            group: 'nodes',
            data: {
                type: NODE_TYPE.ISSUE,
                issue: issue.id,
                issueType: issue.issuetype,
            },
        }))
        .toArray()
    writeArray(simplifiedIssues, AVAILABLE_NODE_TYPES.ISSUE.filename, preparedDataDir)
}

/* ****************+
 * EDGES
 *******************/

function createEdgesForMentions(): void {
    const mentions = readJsonFile<Record<string, CommentMentions>>('commentMentions.json', dataDir)

    const mentionPerUser: ElementDefinition[] = []
    let maxCountPerUser = 0
    const mentionPerUserPerTicket: ElementDefinition[] = []
    let maxCountPerUserPerTicket = 0
    const mentionPerUserPerComment: ElementDefinition[] = []

    for (const [user, issuesPings] of Object.entries(mentions)) {
        const mentionsPerUserCount: Record<string, number> = {}
        for (const [issue, comments] of Object.entries(issuesPings)) {
            const mentionPerUserPerTicketCount: Record<string, number> = {}
            for (const comment of comments) {
                for (const mentionedUser of comment.mentionedUsers
                    .filter((mentionedUser) => users.has(mentionedUser))) {
                    mentionPerUserPerComment.push({
                        group: 'edges',
                        data: {
                            type: EDGE_TYPE.MENTION_PER_COMMENT,
                            id: `${user}-${issue}-${comment.comment}-${mentionedUser}`,
                            source: user,
                            target: mentionedUser,
                            count: 1,
                            weight: 1,
                        },
                    })
                    mentionPerUserPerTicketCount[mentionedUser] = (mentionPerUserPerTicketCount[mentionedUser] ?? 0) + 1
                    mentionsPerUserCount[mentionedUser] = (mentionsPerUserCount[mentionedUser] ?? 0) + 1
                }
            }

            for (const [mentionedUser, count] of Object.entries(mentionPerUserPerTicketCount)) {
                mentionPerUserPerTicket.push({
                    group: 'edges',
                    data: {
                        type: EDGE_TYPE.MENTION_PER_TICKET,
                        id: `${user}-${issue}-${mentionedUser}`,
                        source: user,
                        target: mentionedUser,
                        count,
                    },
                })
                maxCountPerUserPerTicket = Math.max(maxCountPerUserPerTicket, count)
            }
        }

        for (const [mentionedUser, count] of Object.entries(mentionsPerUserCount)) {
            mentionPerUser.push({
                group: 'edges',
                data: {
                    type: EDGE_TYPE.MENTION_PER_USER,
                    id: `${user}-${mentionedUser}`,
                    source: user,
                    target: mentionedUser,
                    count,
                },
            })
            maxCountPerUser = Math.max(maxCountPerUser, count)
        }
    }

    // normalize
    for (const item of mentionPerUser) {
        item.data.weight = item.data.count / maxCountPerUser
    }
    for (const item of mentionPerUserPerTicket) {
        item.data.weight = item.data.count / maxCountPerUserPerTicket
    }

    mentionPerUser.sort((a, b) => b.data.count - a.data.count)
    mentionPerUserPerTicket.sort((a, b) => b.data.count - a.data.count)
    mentionPerUserPerComment.sort((a, b) => b.data.count - a.data.count)

    writeArray(mentionPerUser, AVAILABLE_EDGES.MENTION_PER_USER.filename, preparedDataDir)
    writeArray(mentionPerUserPerTicket, AVAILABLE_EDGES.MENTION_PER_TICKET.filename, preparedDataDir)
    writeArray(mentionPerUserPerComment, AVAILABLE_EDGES.MENTION_PER_COMMENT.filename, preparedDataDir)
}

function createEdgesSprintIssues(): void {
    const sprintIssueEdges = issues.values().flatMap((issue) => (issue.sprints ?? []).map((sprint) => ({
        group: 'edges',
        data: {
            type: EDGE_TYPE.SPRINT_ISSUE,
            id: `${sprint}-${issue.id}`,
            source: sprint.toString(),
            target: issue.id,
        },
    }))).filter(Boolean).toArray()
    writeArray(sprintIssueEdges, AVAILABLE_EDGES.SPRINT_ISSUE.filename, preparedDataDir)
}

function createEdgesUserIssue(): void {
    const userIssue = issues.values().flatMap<ElementDefinition>((issue) =>
        issue.assignedUsersUnique?.map((user) => ({
            group: 'edges',
            data: {
                type: EDGE_TYPE.USER_ISSUE,
                id: `${user}-${issue.id}`,
                source: issue.id,
                target: user,
            },
        }))).filter(Boolean).toArray()
    writeArray(userIssue, AVAILABLE_EDGES.USER_ISSUE.filename, preparedDataDir)
}

function createEdgesIssueLinks(): void {
    const issueLinkTypes = readMap<string, Data.IssueLinkType>('issueLinkTypes.json', dataDir)
    const issueLinks = readMap<string, Data.IssueLink>('links.json', dataDir).values()
        .filter((link) => link.inwardIssue && link.outwardIssue && issues.has(link.inwardIssue.id) && issues.has(link.outwardIssue.id))
        .map((link) => ({
            group: 'edges',
            data: {
                type: EDGE_TYPE.ISSUE_LINK,
                id: link.id,
                source: link.inwardIssue!.id,
                target: link.outwardIssue!.id,
                linkType: issueLinkTypes.get(link.type)?.name,
            },
        })).toArray()
    writeArray(issueLinks, AVAILABLE_EDGES.ISSUE_LINK.filename, preparedDataDir)
}

/* ****************+
 * Transport-Lines
 *******************/

const notYetDoneSprint = -1
type Station = {
    sprintId: number
    issues: Data.Issue[]
}

type StationNode = ElementDefinition & {
    data: DataPrepared.Station
}

/**
 * Maps issue IDs to their corresponding stations via sprints
 * @type {Map<string, Map<number, Set<StationNode>>>}
 */
const issueStationMap = new Map<Data.Issue, Map<number, Set<StationNode>>>()

type Lines = Map<string, ElementDefinition[]>

function createTransportGroups(): Map<string, Data.Issue[]> {
    const areaGraph = new AreaGraph()
    const transportGroups = new Map<string, Data.Issue[]>()

    for (const issue of issues.values()
        .filter((issue) => issueMeta.get(issue.id)?.area)) {
        const areas = issueMeta.get(issue.id)?.area ?? []
        for (const area of areaGraph.getRootNodes(areas)) {
            if (!transportGroups.has(area)) {
                transportGroups.set(area, [])
            }
            transportGroups.get(area)?.push(issue)
        }
    }
    return transportGroups
}

function getSortedSprintIds(issuesBySprint: Map<number, Data.Issue[]>): number[] {
    return issuesBySprint.keys().toArray().sort((sprintA, sprintB) => {
        if (sprintA === notYetDoneSprint) {
            return 1
        }
        if (sprintB === notYetDoneSprint) {
            return -1
        }

        const startDateA = sprints.get(sprintA)!.startDate!
        const startDateB = sprints.get(sprintB)!.startDate!
        return startDateA.localeCompare(startDateB)
    })
}

function addStationNodeToLookupMap(station: Station, stationNode: StationNode): void {
    const sprintId = station.sprintId
    // ignore the future for now
    if (sprintId === notYetDoneSprint) {
        return
    }
    for (const issue of station.issues) {
        if (!issueStationMap.has(issue)) {
            issueStationMap.set(issue, new Map())
        }
        if (!issueStationMap.get(issue)!.has(sprintId)) {
            issueStationMap.get(issue)!.set(sprintId, new Set())
        }
        issueStationMap.get(issue)!.get(sprintId)!.add(stationNode)
    }
}

function buildLine(area: string, stations: Station[]): ElementDefinition[] {
    let lastSprintNumber: undefined | number
    return stations.flatMap((station, index, array) => {
        const sprintId = station.sprintId
        const sprint = sprints.get(station.sprintId)
        const stationId: DataPrepared.StationId = `${area}-station-${sprintId}`
        const future = station.sprintId === notYetDoneSprint

        const stationNode: StationNode = {
            group: 'nodes',
            data: {
                type: 'station',
                future,
                line: area,
                id: stationId,
                sprintId,
                sprintNumber: sprint?.number,
                name: sprint?.number?.toString() ?? sprint?.name ?? 'no-sprint',
                issues: station.issues.map((issue) => {
                    return issue.id
                }),
                // it would be more precise to check the date of the mention/assignment and check that against the sprint
                assignedUsers: unique(station.issues.flatMap((issue) => issue.assignedUsersUnique)),
                mentionedUsers: unique(station.issues.flatMap((issue) => issue.mentionedUsersUnique)),
                areas: unique(station.issues.flatMap((issue) => issueMeta.get(issue.id)?.area ?? [])),
            },
        }
        addStationNodeToLookupMap(station, stationNode)

        const lineSegment: ElementDefinition | undefined = index > 0
            ? {
                group: 'edges',
                data: {
                    type: 'segment',
                    future,
                    line: area,
                    id: `${area}-segment-${sprintId}`,
                    source: `${area}-station-${array[index - 1].sprintId}`,
                    target: stationId,
                    distance: sprint?.number && lastSprintNumber
                        ? sprint.number - lastSprintNumber
                        : 0,
                } satisfies DataPrepared.LineSegment,
            }
            : undefined
        lastSprintNumber = sprint?.number
        return [lineSegment, stationNode]
    }).filter((item): item is ElementDefinition => !!item)
}

function createTransportLines(): Lines {
    const transportGroups = createTransportGroups()

    return new Map(transportGroups.entries()
        .filter(([area, areaIssues]) => {
            const multipleSprints = unique(areaIssues.flatMap((issue) => issue.sprints ?? [])).length > 1
            if (!multipleSprints) {
                console.warn(`Area ${area} has only one sprint. Skipping line generation.`)
            }
            return multipleSprints
        })
        .map<[area: string, ElementDefinition[]]>(([area, areaIssues]) => {
            // Group issues by sprint. An issue can occur in more than one stop.
            const issuesBySprint = new Map<number, Data.Issue[]>()
            areaIssues.forEach((issue) => {
                const issueSprints = issue.sprints?.length
                    ? issue.sprints.map((sprintId) => {
                        return sprints.get(sprintId)?.startDate
                            ? sprintId
                            : notYetDoneSprint
                    })
                    : [notYetDoneSprint]
                issueSprints.forEach((sprintId) => {
                    const sprintIssues = issuesBySprint.get(sprintId) ?? []
                    sprintIssues.push(issue)
                    issuesBySprint.set(sprintId, sprintIssues)
                })
            })

            const stations = getSortedSprintIds(issuesBySprint)
                .map((sprintId) => ({sprintId, issues: issuesBySprint.get(sprintId) ?? []}))
            return [area, buildLine(area, stations)]
        }))
}

type IntersectionEntry = {
    lines: Set<string>
    nodes: Set<ElementDefinition>
    issues: Set<Data.Issue>
}

function calculateIntersectionsNew() {
    const baseIntersections = new Map<string, IntersectionEntry>()
    for (const [issue, sprints] of issueStationMap.entries()) {
        for (const stationNodes of sprints.values()) {
            if (stationNodes.size < 2) {
                continue
            }
            const stationArray = stationNodes.values().toArray()
            const key = stationArray
                .map<string>((stationNode) => `${stationNode.data.line}-${stationNode.data.sprintId}`)
                .sort((a, b) => a.localeCompare(b))
                .join('|')
            if (!baseIntersections.has(key)) {
                baseIntersections.set(key, {
                    lines: new Set(),
                    nodes: new Set(),
                    issues: new Set(),
                })
            }
            const entry = baseIntersections.get(key)!
            entry.issues.add(issue)
            for (const stationNode of stationArray) {
                entry.lines.add(stationNode.data.line)
                entry.nodes.add(stationNode)
            }
        }
    }
    return baseIntersections
}

function calculateIntersections(lines: Lines): Map<string, IntersectionEntry> {
    const linesCopy = new Map(lines)
    const intersections = new Map<string, IntersectionEntry>()
    for (const [area, line] of linesCopy) {
        linesCopy.delete(area)
        const nodes = line.filter((element) => element.group === 'nodes')
        for (const node of nodes) {
            // skip future for now
            if (node.data.future) {
                continue
            }

            for (const [otherArea, otherLine] of linesCopy) {
                const otherNodes = otherLine.filter((element) => element.group === 'nodes')
                for (const otherNode of otherNodes) {
                    // skip future for now (for safety also here)
                    if (otherNode.data.future) {
                        continue
                    }

                    const issueIds = unique((node.data.issues ?? []).map((issue: Data.Issue) => issue.id))
                    const otherIssueIds = new Set(
                        unique((otherNode.data.issues ?? []).map((issue: Data.Issue) => issue.id)),
                    )
                    const commonIssueIds = issueIds
                        .filter((issueId) => otherIssueIds.has(issueId))
                        .sort((a, b) => a.localeCompare(b))

                    if (commonIssueIds.length === 0) {
                        continue
                    }

                    const intersectionKey = commonIssueIds.join(',')
                    const intersection = intersections.get(intersectionKey) ?? {lines: new Set(), nodes: new Set(), issues: new Set()}
                    intersection.lines.add(area)
                    intersection.lines.add(otherArea)
                    intersection.nodes.add(node)
                    intersection.nodes.add(otherNode)
                    commonIssueIds.forEach((issue) => intersection.issues.add(issue))
                    intersections.set(intersectionKey, intersection)
                }
            }
        }
    }

    // - ignore non-sprint-tickets ?
    // - deal with: a node aka "station" can only have one! parent, but we have multiple issues per "station"
    //   which leads to the existence of multiple intersections for one node. options:
    //   -- combine these into one big intersection? -> might trigger snowballing
    //   -- find "main" intersection? maybe... keep as much "stations" as possible together -> finding an algorithm
    //      might be hard

    return intersections
}

function createNetwork(): void {
    const lines = createTransportLines()

    const intersections = calculateIntersectionsNew()

    const intersectionNodes: DataPrepared.IntersectionElement[] = []
    for (const [id, entry] of intersections.entries()) {
        const nodeId = `intersection-${id}`
        intersectionNodes.push({
            group: 'nodes',
            data: {
                id: nodeId,
                type: 'intersection',
                lines: entry.lines.values().toArray(),
                issues: entry.issues.values()
                    .map((issue) => issue.id)
                    .toArray(),
                children: entry.nodes.values().map((node) => node.data.id!).toArray(),
            },
        })
        for (const node of entry.nodes.values()) {
            node.data.parent = nodeId
        }
    }
    writeArray(intersectionNodes, 'intersections', preparedDataDir)

    for (const [area, elements] of lines) {
        writeArray(elements, `lines/${normalizeFilename(area)}`, preparedDataDir)
    }

    const predefinedColors = readArray<Record<'normal' | 'unused', string>>('colors.json', additionalDataDir)

    const areasWithLines = lines.entries().toArray()
        .sort((a, b) => b[1].length - a[1].length)
        .map<DataPrepared.LineInfo>(([name], index) => {
            const handPickedColor = index < predefinedColors.length
            const predefinedColor = handPickedColor
                ? predefinedColors[index]
                : undefined
            const hue = Math.floor(Math.random() * 360)
            return {
                name,
                handPickedColor,
                filename: `lines/${normalizeFilename(name)}`,
                colorNormal: predefinedColor?.normal ?? `hsl(${hue}, 100%, 50%)`,
                colorUnused: predefinedColor?.unused ?? `hsl(${hue}, 70%, 85%)`,
            }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    writeArray(areasWithLines, 'lines', preparedDataDir)
}

function prepareData(): void {
    // apply Meta-Data
    applyMetaData()

    // "raw" data
    writeRawData()

    // Nodes
    createUserNodes()
    createComponentNodes()
    createSprintNodes()
    createIssueNodes()

    // Edges
    createEdgesForMentions()
    createEdgesSprintIssues()
    createEdgesUserIssue()
    createEdgesIssueLinks()

    // Transport lines
    createNetwork()
}
prepareData()
