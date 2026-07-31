import type {ElementDefinition} from 'cytoscape'
import fs from 'node:fs'
import type {Data} from '../types/data.ts'
import type {CommentMentions} from './detectConnections.ts'
import {dataDir, readJsonFile, readMap, simplifiedDataDir, writeArray} from './util.ts'

const users = readMap<Data.User>('users.json')

function simplifyMentions(): void {
    const mentions = readJsonFile<Record<string, CommentMentions>>('commentMentions.json', dataDir)

    const mentionPerUser: ElementDefinition[] = []
    let maxCountPerUser = 0
    const mentionPerUserPerTicket: ElementDefinition[] = []
    let maxCountPerUserPerTicket = 0
    const mentionPerUserPerTicketPerComment: ElementDefinition[] = []

    Object.entries(mentions).forEach(([user, issuesPings]) => {
        const mentionsPerUserCount: Record<string, number> = {}
        Object.entries(issuesPings).forEach(([issue, comments]) => {
            const mentionPerUserPerTicketCount: Record<string, number> = {}
            comments.forEach(comment => {
                comment.mentionedUsers
                    .filter(mentionedUser => users.has(mentionedUser))
                    .forEach(mentionedUser => {
                        mentionPerUserPerTicketPerComment.push({
                            group: 'edges',
                            data: {
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
    mentionPerUserPerTicketPerComment.sort((a, b) => b.data.count - a.data.count)

    writeArray(mentionPerUser, 'mentionPerUser', simplifiedDataDir)
    writeArray(mentionPerUserPerTicket, 'mentionPerUserPerTicket', simplifiedDataDir)
    writeArray(mentionPerUserPerTicketPerComment, 'mentionPerUserPerTicketPerComment', simplifiedDataDir)
}

function simplify(): void {
    fs.mkdirSync(simplifiedDataDir, { recursive: true })
    simplifyMentions()
}
simplify()
