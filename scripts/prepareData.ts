import type {ElementDefinition} from 'cytoscape'
import type {DataAdditional} from '../types/data-additional.d.ts'
import type {DataPrepared} from '../types/data-prepared.ts'
import type {Data} from '../types/data.ts'
import {AreaGraph} from '../src/areaGraph.ts'
import {AVAILABLE_EDGES, AVAILABLE_NODE_TYPES, EDGE_TYPE, NODE_TYPE} from './const.ts'
import type {CommentMentions} from './evaluateData.ts'
import {additionalDataDir, dataDir, readJsonFile, readMap, simplifiedDataDir, unique, writeArray} from './util.ts'

// additional user-provided data
const issueMeta = readMap<DataAdditional.IssueMetaFile>('issueMeta.json', additionalDataDir)

// exported & normalized data from jira
const users = readMap<Data.UserFile>('users.json', dataDir)
const issueTypes = readMap<Data.IssueTypeFile>('types.json', dataDir)
const sprints = readMap<Data.SprintFile>('sprints.json', dataDir, true)
const issues = readMap<Data.IssueFile>('issues.json', dataDir)



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

function simplifyIssue(issue: Data.Issue) {
    return {
        id: issue.id,
        key: issue.key,
        issueType: issueTypes.get(issue.issuetype)?.name,
        summary: issue.summary,
        status: issue.status,
        sprints: issue.sprints,
        area: issueMeta.get(issue.id)?.area,
        components: issueMeta.get(issue.id)?.components || issue.components,
        assignedUsers: issue.assignedUsers,
        mentionedUsers: issue.mentionedUsers,
    }
}

function issueToNode(issue: Data.Issue): ElementDefinition {
    return {
        group: 'nodes',
        data: {
            ...simplifyIssue(issue),
            type: NODE_TYPE.ISSUE,
        }
    }
}

function normalizeFilename(name: string): string {
    return name.toLowerCase()
        .replaceAll(' ', '-')
        .replaceAll('ä', 'ae')
        .replaceAll('ö', 'oe')
        .replaceAll('ü', 'ue')
}

/* ****************+
 * NODES
 *******************/
export type UserData = {
    type: 'user'
    id: string
    displayName: string
}

function prepareUsers(): void {
    const usersForCytoscape = users.values().map<ElementDefinition>(user => ({
        group: 'nodes',
        data: {
            type: NODE_TYPE.USER,
            id: user.key,
            displayName: user.displayName,
        } as const satisfies UserData,
    })).toArray()
    writeArray(usersForCytoscape, AVAILABLE_NODE_TYPES.USER.filename, simplifiedDataDir)
}

function prepareComponents(): void {
    const preparedComponents = readMap<Data.ComponentFile>('components.json', dataDir).values()
        .map<ElementDefinition>((component) => ({
            group: 'nodes',
            data: {
                type: NODE_TYPE.COMPONENT,
                ...component,
            }
        })).toArray()
    writeArray(preparedComponents, AVAILABLE_NODE_TYPES.COMPONENT.filename, simplifiedDataDir)
}

function prepareSprints(): void {
    const simplifiedSprints = sprints.values().map<ElementDefinition>((sprint) => ({
        group: 'nodes',
        data: {
            type: NODE_TYPE.SPRINT,
            id: sprint.id.toString(),
            name: sprint.name,
            goal: sprint.goal,
        }
    })).toArray()
    writeArray(simplifiedSprints, AVAILABLE_NODE_TYPES.SPRINT.filename, simplifiedDataDir)
}

function prepareIssues(): void {
    const simplifiedIssues = issues.values()
        .map<ElementDefinition>((issue) => issueToNode(issue))
        .toArray()
    writeArray(simplifiedIssues, AVAILABLE_NODE_TYPES.ISSUE.filename, simplifiedDataDir)
}


/* ****************+
 * EDGES
 *******************/
function prepareMentions(): void {
    const mentions = readJsonFile<Record<string, CommentMentions>>('commentMentions.json', dataDir)

    const mentionPerUser: ElementDefinition[] = []
    let maxCountPerUser = 0
    const mentionPerUserPerTicket: ElementDefinition[] = []
    let maxCountPerUserPerTicket = 0
    const mentionPerUserPerComment: ElementDefinition[] = []

    Object.entries(mentions).forEach(([user, issuesPings]) => {
        const mentionsPerUserCount: Record<string, number> = {}
        Object.entries(issuesPings).forEach(([issue, comments]) => {
            const mentionPerUserPerTicketCount: Record<string, number> = {}
            comments.forEach(comment => {
                comment.mentionedUsers
                    .filter(mentionedUser => users.has(mentionedUser))
                    .forEach(mentionedUser => {
                        mentionPerUserPerComment.push({
                            group: 'edges',
                            data: {
                                type: EDGE_TYPE.MENTION_PER_COMMENT,
                                id: `${user}-${issue}-${comment.comment}-${mentionedUser}`,
                                source: user,
                                target: mentionedUser,
                                count: 1,
                                weight: 1,
                            }
                        })
                        mentionPerUserPerTicketCount[mentionedUser] = (mentionPerUserPerTicketCount[mentionedUser] ?? 0) + 1
                        mentionsPerUserCount[mentionedUser] = (mentionsPerUserCount[mentionedUser] ?? 0) + 1
                })
            })

            Object.entries(mentionPerUserPerTicketCount).forEach(([mentionedUser, count]) => {
                mentionPerUserPerTicket.push({
                    group: 'edges',
                    data: {
                        type: EDGE_TYPE.MENTION_PER_TICKET,
                        id: `${user}-${issue}-${mentionedUser}`,
                        source: user,
                        target: mentionedUser,
                        count,
                    }
                })
                maxCountPerUserPerTicket = Math.max(maxCountPerUserPerTicket, count)
            })
        })

        Object.entries(mentionsPerUserCount).forEach(([mentionedUser, count]) => {
            mentionPerUser.push({
                group: 'edges',
                data: {
                    type: EDGE_TYPE.MENTION_PER_USER,
                    id: `${user}-${mentionedUser}`,
                    source: user,
                    target: mentionedUser,
                    count,
                }
            })
            maxCountPerUser = Math.max(maxCountPerUser, count)
        })
    })

    // normalize
    mentionPerUser.forEach((item) => {
        item.data.weight = item.data.count / maxCountPerUser
    })
    mentionPerUserPerTicket.forEach((item) => {
        item.data.weight = item.data.count / maxCountPerUserPerTicket
    })

    mentionPerUser.sort((a, b) => b.data.count - a.data.count)
    mentionPerUserPerTicket.sort((a, b) => b.data.count - a.data.count)
    mentionPerUserPerComment.sort((a, b) => b.data.count - a.data.count)

    writeArray(mentionPerUser, AVAILABLE_EDGES.MENTION_PER_USER.filename, simplifiedDataDir)
    writeArray(mentionPerUserPerTicket, AVAILABLE_EDGES.MENTION_PER_TICKET.filename, simplifiedDataDir)
    writeArray(mentionPerUserPerComment, AVAILABLE_EDGES.MENTION_PER_COMMENT.filename, simplifiedDataDir)
}

function prepareEdgesSprintIssue(): void {
    const sprintIssueEdges = issues.values().flatMap((issue) => (issue.sprints || []).map((sprint) => ({
        group: 'edges',
        data: {
            type: EDGE_TYPE.SPRINT_ISSUE,
            id: `${sprint}-${issue.id}`,
            source: sprint.toString(),
            target: issue.id,
        }
    }))).filter(Boolean).toArray()
    writeArray(sprintIssueEdges, AVAILABLE_EDGES.SPRINT_ISSUE.filename, simplifiedDataDir)
}

function prepareEdgesUserIssue(): void {
    const userIssue = issues.values().flatMap<ElementDefinition>((issue) =>
        issue.assignedUsersUnique?.map((user) => ({
            group: 'edges',
            data: {
                type: EDGE_TYPE.USER_ISSUE,
                id: `${user}-${issue.id}`,
                source: issue.id,
                target: user,
            }
        }))).filter(Boolean).toArray()
    writeArray(userIssue, AVAILABLE_EDGES.USER_ISSUE.filename, simplifiedDataDir)
}

function prepareIssueLinks(): void {
    const issueLinkTypes = readMap<Data.IssueLinkTypeFile>('issueLinkTypes.json', dataDir)
    const issueLinks = readMap<Data.IssueLinkFile>('links.json', dataDir).values()
        .filter((link) => link.inwardIssue && link.outwardIssue && issues.has(link.inwardIssue.id) && issues.has(link.outwardIssue.id))
        .map((link) => ({
            group: 'edges',
            data: {
                type: EDGE_TYPE.ISSUE_LINK,
                id: link.id,
                source: link.inwardIssue!.id,
                target: link.outwardIssue!.id,
                linkType: issueLinkTypes.get(link.type)?.name,
            }
        })).toArray()
    writeArray(issueLinks, AVAILABLE_EDGES.ISSUE_LINK.filename, simplifiedDataDir)
}


/* ****************+
 * Transport-Lines
 *******************/

const noYetDoneSprint = -1
type Station = {
    sprintId: number
    issues: Data.Issue[]
}

type Lines = Map<string, ElementDefinition[]>

function buildLine(area: string, stations: Station[]): ElementDefinition[] {
    let lastSprintNumber: undefined | number
    // @ts-expect-error
    return stations.flatMap((station, index, array) => {
        const sprintId = station.sprintId
        const sprint = sprints.get(station.sprintId)
        const stationId: DataPrepared.StationId = `${area}-station-${sprintId}`
        const stationNode: ElementDefinition = {
            group: 'nodes',
            data: {
                type: 'station',
                line: area,
                id: stationId,
                sprintId,
                sprintNumber: sprint?.number,
                name: sprint?.number.toString() || sprint?.name || 'no-sprint',
                issues: station.issues.map((issue) => {
                    const {changelog, comments, ...rest} = issue
                    return {...rest}
                }),
                // it would be more precise to check the date of the mention/assignment and check that against the sprint
                assignedUsers: unique(station.issues.flatMap((issue) => issue.assignedUsersUnique ?? [])),
                mentionedUsers: unique(station.issues.flatMap((issue) => issue.mentionedUsersUnique ?? [])),
                areas: unique(station.issues.flatMap((issue) => issueMeta.get(issue.id)?.area ?? []))
            } satisfies DataPrepared.Station,
        }
        const lineSegment: ElementDefinition | undefined = index > 0
            ? {
                group: 'edges',
                data: {
                    type: 'segment',
                    area,
                    id: `${area}-segment-${sprintId}`,
                    source: `${area}-station-${array[index - 1].sprintId}`,
                    target: stationId,
                    distance: sprint?.number && lastSprintNumber
                        ? sprint.number - lastSprintNumber
                        : 0
                } satisfies DataPrepared.LineSegment,
            }
            : undefined
        lastSprintNumber = sprint?.number
        return [lineSegment, stationNode]
    }).filter(Boolean)
}

function createTransportLines(): Lines {
    const areaGraph = new AreaGraph()
    const transportGroups = new Map<string, Data.Issue[]>()

    issues.values()
        .filter((issue) => issueMeta.get(issue.id)?.area)
        .forEach((issue) => {
            const areas = issueMeta.get(issue.id)?.area ?? []
            areaGraph.getRootNodes(areas).forEach((area) => {
                if (!transportGroups.has(area)) {
                    transportGroups.set(area, [])
                }
                transportGroups.get(area)?.push(issue)
            })
        })

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
                    return !!sprints.get(sprintId)?.startDate
                        ? sprintId
                        : noYetDoneSprint
                })
                : [noYetDoneSprint]
            issueSprints.forEach((sprintId) => {
                const sprintIssues = issuesBySprint.get(sprintId) ?? []
                sprintIssues.push(issue)
                issuesBySprint.set(sprintId, sprintIssues)
            })
        })

        const sprintIds = issuesBySprint.keys().toArray().sort((sprintA, sprintB) => {
            if (sprintA === noYetDoneSprint) {
                return 1
            }
            if (sprintB === noYetDoneSprint) {
                return -1
            }

            const startDateA = sprints.get(sprintA)!.startDate!
            const startDateB = sprints.get(sprintB)!.startDate!
            return startDateA.localeCompare(startDateB)
        })

        const stations = sprintIds.map((sprintId) => ({sprintId, issues: issuesBySprint.get(sprintId) ?? []}))
        return [normalizeFilename(area), buildLine(area, stations)]
    }))
}

type IntersectionEntry = {
    lines: Set<string>
    nodes: Set<ElementDefinition>
    issues: Set<Data.Issue>
}

function calculateIntersections(lines: Lines): Map<string, IntersectionEntry> {
    const linesCopy = new Map(lines)
    const intersections = new Map<string, IntersectionEntry>()
    for (const [area, line] of linesCopy) {
        linesCopy.delete(area)
        const nodes = line.filter((element) => element.group === 'nodes')
        for (const node of nodes) {
            for (const [otherArea, otherLine] of linesCopy) {
                const otherNodes = otherLine.filter((element) => element.group === 'nodes')
                for (const otherNode of otherNodes) {
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

    const intersections = calculateIntersections(lines)

    const intersectionNodes: ElementDefinition[] = []
    for (const [id, entry] of intersections.entries()) {
        const nodeId = `intersection-${id}`
        intersectionNodes.push({
            group: 'nodes',
            data: {
                id: nodeId,
                type: 'intersection',
                lines: entry.lines.values().toArray(),
                issues: entry.issues.values()
                    .map((id) => simplifyIssue(issues.get(id)))
                    .toArray(),
                children: entry.nodes.values().map((node) => node.data.id).toArray(),
            }
        })
        for (const node of entry.nodes.values()) {
            node.data.parent = nodeId
        }
    }
    writeArray(intersectionNodes, 'intersections', simplifiedDataDir)

    for (const [area, elements] of lines) {
        writeArray(elements, `lines/${area}`, simplifiedDataDir)
    }
    const areasWithLines = lines.entries().toArray()
        .map((line) => line[0])
        .sort((a, b) => a.localeCompare(b))
    writeArray(areasWithLines, 'lines', simplifiedDataDir)
}

function prepareData(): void {
    // apply Meta-Data
    applyMetaData()

    // Nodes
    prepareUsers()
    prepareComponents()
    prepareSprints()
    prepareIssues()

    // Edges
    prepareMentions()
    prepareEdgesSprintIssue()
    prepareEdgesUserIssue()
    prepareIssueLinks()

    // Transport lines
    createNetwork()
}
prepareData()
