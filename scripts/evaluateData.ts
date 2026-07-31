import type {Data} from '../types/data.ts'
import {readArray, writeMap} from './util.ts'

// const user = readMap<Data.User>('users.json')
// const sprints = readMap<Data.Sprint>('sprints.json')
// const components = readMap<Data.Component>('components.json')
// const issueLinkTypes = readMap<Data.IssueLinkType>('issueLinkTypes.json')
// const links = readMap<Data.IssueLink>('links.json')
// const statuses = readMap<Data.Status>('statuses.json')
// const issueType = readMap<Data.IssueType>('types.json')
const issues  = readArray<Data.Issue>('issues.json')

export type CommentMentions = {
    [issueKey: string]: Array<{
        /** id of comment */
        comment: string
        mentionedUsers: string[]
    }>
}

function detectCommentPings(): void {
    const pings = new Map<string, CommentMentions>()

    for (const issue of issues) {
        for (const comment of issue.comments) {
            if (comment.mentionedUsers.length > 0) {
                const issueKey = issue.key
                const author = comment.author
                if (!pings.has(author)) {
                    pings.set(author, {})
                }
                const ping = pings.get(author)!
                if (!ping[issueKey]) {
                    ping[issueKey] = []
                }
                ping[issueKey].push({
                    comment: comment.id,
                    mentionedUsers: comment.mentionedUsers
                })
            }
        }
    }

    writeMap(pings, 'commentMentions')
}

function evaluateData(): void {
    detectCommentPings()
}

evaluateData()
