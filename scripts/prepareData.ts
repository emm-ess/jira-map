import fs from 'node:fs'
import type {DataRaw} from '../types/data-raw.ts'
import type {Data} from '../types/data.ts'
import {getJsonFilesOfDirectory, outputDir, readJsonFile, writeArray, writeMap} from './util.ts'

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
const issues: Data.Issue[] = []

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

    user.set(rawUser.key, {
        key: rawUser.key,
        name: rawUser.name,
        avatarUrls: rawUser.avatarUrls,
        displayName: rawUser.displayName,
    })

    return rawUser.key
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

function processChangelog(rawChangelog: DataRaw.IssueChangelog): Data.IssueChangelogHistory[] {
    return rawChangelog.histories.map((history) => ({
        id: history.id,
        author: processUser(history.author),
        created: history.created,
        items: history.items,
    }))
}

function processAssignedUsers(changelog: Data.IssueChangelogHistory[], currentAssignee?: string): string[] {
    const assignedUsers = changelog.flatMap((history) =>
        history.items
            .filter((item) => item.field === 'assignee')
            .flatMap((item) => [item.from, item.to]),
    ).filter((user, index, array) => {
        return !(!user || (index !== 0 && user !== array[index - 1]))
    })

    if (currentAssignee) {
        assignedUsers.unshift(currentAssignee)
    }

    return assignedUsers
}

function processIssue(issue: DataRaw.Issue): Data.Issue {
    const assignee = processUser(issue.fields.assignee)
    const changelog = processChangelog(issue.changelog)
    const comments = issue.fields.comment.comments.map(processComment)

    const processedIssue: Data.Issue = {
        id: issue.id,
        key: issue.key,
        assignee,
        assignedUsers: processAssignedUsers(changelog, assignee),
        mentionedUsers: comments.flatMap((comment) => comment.mentionedUsers),
        sprints: processSprintString(issue.fields.customfield_10005),
        summary: issue.fields.summary,
        issuetype: processIssueType(issue.fields.issuetype),
        lastViewed: issue.fields.lastViewed,
        components: issue.fields.components.map(processComponent),
        subtasks: issue.fields.subtasks.map((subtask) => {
            processLinkedIssue(subtask)
            return subtask.id
        }),
        created: issue.fields.created,
        description: issue.fields.description,
        reporter: processUser(issue.fields.reporter),
        issuelinks: issue.fields.issuelinks.map(processIssueLink),
        updated: issue.fields.updated,
        status: processStatus(issue.fields.status),
        comments,
        changelog,
    }

    if (issue.fields.customfield_10002 !== null) {
        processedIssue.storypoints = Math.round(issue.fields.customfield_10002)
    }

    issues.push(processedIssue)

    return processedIssue
}

function fixMentionedUsers() {
    const traversedUsers = new Map(user.entries().map(([key, user]) => [user.name, key]))
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

function fixInactiveUser() {
    user.values().forEach((user) => {
        if (user.displayName.endsWith(' [X]')) {
            user.displayName = user.displayName.slice(0, -4)
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
        fixMentionedUsers()
        fixInactiveUser()
        process.stdout.write(`\r${dirent.name} done`)
    }

    fs.mkdirSync(outputDir, { recursive: true })
    writeMap(user, 'users')
    writeMap(sprints, 'sprints')
    writeMap(components, 'components')
    writeMap(issueLinkTypes, 'issueLinkTypes')
    writeMap(links, 'links')
    writeMap(statuses, 'statuses')
    writeMap(issueType, 'types')
    writeArray(issues, 'issues')
}

main()
