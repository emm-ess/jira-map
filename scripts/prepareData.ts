import type {ElementDefinition} from 'cytoscape'
import fs from 'node:fs'
import type {Data} from '../types/data.ts'
import {AVAILABLE_EDGES, AVAILABLE_NODE_TYPES, EDGE_TYPE, NODE_TYPE} from './const.ts'
import type {CommentMentions} from './evaluateData.ts'
import {dataDir, readJsonFile, readMap, simplifiedDataDir, writeArray} from './util.ts'

const users = readMap<Data.User>('users.json', dataDir)
const issueTypes = readMap<Data.IssueType>('types.json', dataDir)
const sprints = readMap<Data.Sprint>('sprints.json', dataDir)
const issues = readJsonFile<Data.Issue[]>('issues.json', dataDir)

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
    const simplifiedIssues = issues.map<ElementDefinition>((issue) => ({
        group: 'nodes',
        data: {
            type: NODE_TYPE.ISSUE,
            id: issue.id,
            key: issue.key,
            issueType: issueTypes.get(issue.issuetype)?.name,
            summary: issue.summary,
            status: issue.status,
        }
    }))
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
    // @ts-expect-error we do filter for undefined
    const sprintIssueEdges: ElementDefinition[] = issues.flatMap((issue) => issue.sprints?.map((sprint) => ({
        group: 'edges',
        data: {
            type: EDGE_TYPE.SPRINT_ISSUE,
            id: `${sprint}-${issue.key}`,
            source: sprint,
            target: issue.key,
        }
    }))).filter(Boolean)
    writeArray(sprintIssueEdges, AVAILABLE_EDGES.SPRINT_ISSUE.filename, simplifiedDataDir)
}

function prepareEdgesUserIssue(): void {
    const userIssue = issues.flatMap<ElementDefinition>((issue) =>
        issue.assignedUsersUnique?.map((user) => ({
            group: 'edges',
            data: {
                type: EDGE_TYPE.USER_ISSUE,
                id: `${user}-${issue.id}`,
            }
        }))).filter(Boolean)
    writeArray(userIssue, AVAILABLE_EDGES.USER_ISSUE.filename, simplifiedDataDir)
}

function prepareIssueLinks(): void {
    const issueLinkTypes = readMap<Data.IssueLinkType>('issueLinkTypes.json', dataDir)
    const issueLinks = readMap<Data.IssueLink>('links.json', dataDir).values()
        .filter((link) => link.inwardIssue && link.inwardIssue)
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

function prepareData(): void {
    fs.mkdirSync(simplifiedDataDir, { recursive: true })
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
}
prepareData()
