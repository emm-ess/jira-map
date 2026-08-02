import type {ElementDefinition} from 'cytoscape'
import type {DataAdditional} from '../types/data-additional.d.ts'
import type {Data} from '../types/data.ts'
import {AVAILABLE_EDGES, AVAILABLE_NODE_TYPES, EDGE_TYPE, NODE_TYPE} from './const.ts'
import type {CommentMentions} from './evaluateData.ts'
import {additionalDataDir, dataDir, readJsonFile, readMap, simplifiedDataDir, writeArray} from './util.ts'

// additional user-provided data
const issueMeta = readMap<DataAdditional.IssueMeta>('issueMeta.json', additionalDataDir)

// exported & normalized data from jira
const users = readMap<Data.User>('users.json', dataDir)
const issueTypes = readMap<Data.IssueType>('types.json', dataDir)
const sprints = readMap<Data.Sprint>('sprints.json', dataDir)
const issues = readMap<Data.Issue>('issues.json', dataDir)



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
// provide a graph for traversing data
class AreaGraph {
    // data consist of key -> parentKeys[]
    data = readMap<string[]>('areaMeta.json', additionalDataDir)

    getRootNodes(keys: string[]): string[] {
        return [...new Set(keys.flatMap((key) => this.getRootNode(key)))]
    }

    getRootNode(key: string): string[] {
        const visited = new Set<string>()

        const getRoots = (currentKey: string): string[] => {
            if (visited.has(currentKey)) {
                return [currentKey]
            }

            const parentKeys = this.getParentNodes(currentKey)
            if (!parentKeys?.length) {
                return [currentKey]
            }

            visited.add(currentKey)
            return [...new Set(parentKeys.flatMap((parentKey) => getRoots(parentKey)))]
        }

        return getRoots(key)
    }

    getParentNodes(key: string): string[] | void {
        return this.data.get(key)
    }

    // seems faulty
    // getChildren(key: string): string[] {
    //     return this.data.entries()
    //         .filter(([, parentKeys]) => parentKeys.includes(key))
    //         .map(([childKey]) => childKey)
    //         .toArray()
    // }
}

function issueToNode(issue: Data.Issue): ElementDefinition {
    return {
        group: 'nodes',
        data: {
            type: NODE_TYPE.ISSUE,
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
    const preparedComponents = readMap<Data.Component>('components.json', dataDir).values()
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
            id: sprint.id,
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
            source: sprint,
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
    const issueLinkTypes = readMap<Data.IssueLinkType>('issueLinkTypes.json', dataDir)
    const issueLinks = readMap<Data.IssueLink>('links.json', dataDir).values()
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

const noYetDoneSprint = 'future'
type Station = {
    sprintId: string
    issues: Data.Issue[]
}

function buildLine(area: string, stations: Station[]): ElementDefinition[] {
    // @ts-expect-error
    return stations.flatMap((station, index, array) => {
        const stationId = `${area}-station-${station.sprintId}`
        const stationNode: ElementDefinition = {
            group: 'nodes',
            data: {
                type: 'station',
                id: stationId,
            },
        }
        const issueNodes = station.issues.map<ElementDefinition>((issue) => {
            const node = issueToNode(issue)
            node.data.parent = stationId
            return node
        })
        const lineSegment: ElementDefinition | undefined = index > 0
            ? {
                group: 'edges',
                data: {
                    type: 'segment',
                    area,
                    id: `${area}-segment-${station.sprintId}`,
                    source: `${area}-station-${array[index - 1].sprintId}`,
                    target: stationId,
                },
            }
            : undefined
        return [stationNode, ...issueNodes, lineSegment]
    }).filter(Boolean)
}

function createTransportLines(): void {
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

    const lines = transportGroups.entries().map<[area: string, ElementDefinition[]]>(([area, areaIssues]) => {
        // Group issues by sprint. An issue can occur in more than one stop.
        const issuesBySprint = new Map<string, Data.Issue[]>()
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
    }).toArray()

    for (const [area, elements] of lines) {
        writeArray(elements, `lines/${area}`, simplifiedDataDir)
    }
    const areasWithLines = lines
        .map((line) => line[0])
        .sort((a, b) => a.localeCompare(b))
    writeArray(areasWithLines, 'lines', simplifiedDataDir)
}

function normalizeFilename(name: string): string {
    return name.toLowerCase()
        .replaceAll(' ', '-')
        .replaceAll('ä', 'ae')
        .replaceAll('ö', 'oe')
        .replaceAll('ü', 'ue')
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
    createTransportLines()
}
prepareData()
