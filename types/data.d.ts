import type {DataRaw} from './data-raw'

declare namespace Data {
    // User
    //------------------
    export type User = Pick<DataRaw.User, 'key' | 'avatarUrls' | 'displayName' | 'name'>

    /** key is field `key` of user */
    export type UserFile = Map<string, User>

    // Sprint
    //------------------
    export type Sprint = {
        id: number
        number: number
        /** seems to be id of previous sprint */
        previous: number
        name: string
        goal?: string
        state: string
        startDate?: string
        endDate?: string
        activatedDate?: string
        completeDate?: string
    }

    /** id is field `id` of Sprint */
    export type SprintFile = Map<number, Sprint>

    // Components
    //------------------
    export type Component = Omit<DataRaw.ProjectComponent, 'self'>

    /** id is field `id` of Component */
    export type ComponentFile = Map<string, Component>

    // IssueLink
    //------------------
    export type LinkedIssue = {
        /** The ID of the issue. */
        id: string;
        /** The ID of the issueType. */
        issuetype: string
    }

    export type IssueLinkType = Omit<DataRaw.IssueLinkType, 'self'>
    /** id is field `id` of IssueLink */
    export type IssueLinkTypeFile = Map<string, IssueLinkType>

    export type IssueLink = {
        /** The ID of the issue link. */
        id: string;
        inwardIssue?: LinkedIssue;
        outwardIssue?: LinkedIssue;
        /** The ID of the IssueLinkType. */
        type: string;
    }

    /** id is field `id` of IssueLink */
    export type IssueLinkFile = Map<string, IssueLink>

    // Issue-Status
    //------------------
    export type StatusCategory = Omit<DataRaw.StatusCategory, 'self'>
    export type Status = Omit<DataRaw.Status, 'self' | 'iconUrl' | 'statusCategory'> & {
        statusCategory: StatusCategory
    }

    /** id is field `id` of Status */
    export type StatusFile = Map<string, Status>

    // Issue-Type
    //------------------
    export type IssueType = Pick<DataRaw.IssueType, 'id' | 'name' | 'subtask'>

    /** id is field `id` of IssueType */
    export type IssueTypeFile = Map<string, IssueType>

    // Issue
    //------------------
    export type Comment = Omit<DataRaw.Comment, 'self' | 'author' | 'updateAuthor'> & {
        /** The key of the user */
        author: string
        /** The key of the user */
        updateAuthor?: string
        /** The key of the users. If user couldn't be found it will be the name of the user. */
        mentionedUsers: string[]
        /** The ID of the former subtask. */
        fromFormerSubtask?: string
    }

    export type IssueChangelogHistory = Omit<DataRaw.IssueChangelogHistory, 'author'> & {
        /** The key of the user */
        author: string
        /** The ID of the former subtask. */
        fromFormerSubtask?: string
    }

    export type Issue = {
        /** The ID of the issue. */
        id: string;
        /** The key of the issue. */
        key: string;
        summary: string;
        /** Id of the issueType */
        issuetype: string;
        lastViewed: string | null
        /** Ids of the components */
        components: string[]
        /** Ids of the subtasks */
        subtasks: string[]
        created: string;
        description: string | null;
        /** The key of the user */
        reporter: string;
        /** Story-Punkte (in float) */
        storypoints?: number
        /** Sprint */
        sprints?: number[]
        comments: Comment[]
        issuelinks: string[];
        /** The key of the user */
        assignee: string;
        updated: string
        /** Id of the status */
        status: string;
        changelog: IssueChangelogHistory[];

        /** The keys of the users. If user couldn't be found it will be the name of the user. */
        mentionedUsers: string[]
        /** The keys of the users. If user couldn't be found it will be the name of the user. */
        mentionedUsersUnique: string[]
        /** The keys of the users */
        assignedUsers: string[]
        /** The keys of the users */
        assignedUsersUnique: string[]
    }

    /** id is field `id` of Issue */
    export type IssueFile = Map<string, Issue>
}
