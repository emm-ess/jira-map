// types are taken from "jira.js"

export declare namespace DataRaw {
    export type File = Paged & {
        expand: string
        issues: Issue[]
    }

    export type Issue = {
        /** The ID of the issue. */
        id: string;
        /** The key of the issue. */
        key: string;
        /** The URL of the issue details. */
        self: string;
        /** The rendered value of each field present on the issue. */
        renderedFields?: unknown;
        /** Expand options that include additional issue details in the response. */
        expand: string;
        fields: IssueFields;
        changelog: IssueChangelog;
    }

    export type IssueFields = {
        summary: string;
        issuetype: IssueType;
        lastViewed: string | null
        components: ProjectComponent[]
        subtasks: LinkedIssue[]
        created: string;
        description: string | null;
        reporter: User;
        /** Story-Punkte (in float) */
        customfield_10002: number | null
        /** Sprint */
        customfield_10005: string[] | null
        comment: Paged & {
            comments: Comment[]
        }
        issuelinks: IssueLink[];
        assignee: User;
        updated: string
        status: Status;
    }

    export type LinkedIssue = {
        /** The ID of the issue. */
        id: string;
        /** The key of the issue. */
        key: string;
        /** The URL of the issue details. */
        self: string;
        fields: {
            summary: string;
            status: Status;
            issuetype: IssueType;
        }
    }

    /** Details about an issue type. */
    export type IssueType = {
        /** The URL of the issue type. */
        self: string;
        /** The unique identifier of the issue type. */
        id: string;
        /** The description of the issue type. */
        description: string;
        /** The URL of the icon for the issue type. */
        iconUrl: string;
        /** The name of the issue type. */
        name: string;
        /** Whether the issue type is a subtask type. */
        subtask: boolean;
        /** The ID of the avatar for the issue type. */
        avatarId: number;
    }

    export type IssueChangelog = Paged & {
        /** The list of changelogs. */
        histories: IssueChangelogHistory[]
    }

    export type IssueChangelogHistory = {
        /** The ID of the changelog. */
        id: string;
        /**
         * User details permitted by the user's Atlassian Account privacy settings. However, be aware of these exceptions:
         *
         * User record deleted from Atlassian: This occurs as the result of a right to be forgotten request. In this case,
         * `displayName` provides an indication and other parameters have default values or are blank (for example, email
         * is blank). User record corrupted: This occurs as a results of events such as a server import and can only
         * happen to deleted users. In this case, `accountId` returns _unknown_ and all other parameters have fallback
         * values. User record unavailable: This usually occurs due to an internal service outage. In this case, all
         * parameters have fallback values.
         */
        author: User
        /** The date on which the change took place. */
        created: string;
        items: IssueChangelogHistoryItem[]
    }

    export type IssueChangelogHistoryItem = {
        /** The name of the field changed. */
        field: string;
        /** The type of the field changed. */
        fieldtype: string;
        /** The details of the original value. */
        from?: string | null;
        /** The details of the original value as a string. */
        fromString?: string | null;
        /** The details of the new value. */
        to?: string | null;
        /** The details of the new value as a string. */
        toString?: string;
    }

    /** Details about a project component. */
    export interface ProjectComponent {
        /** The unique identifier for the component. */
        id: string;
        /**
         * The unique name for the component in the project. Required when creating a component. Optional when updating a
         * component. The maximum length is 255 characters.
         */
        name: string;
        /** The URL of the component. */
        self: string;
    }

    /** A comment. */
    export type Comment = {
        /** The URL of the comment. */
        self: string;
        /** The ID of the comment. */
        id: string;
        /** The comment text. */
        body: string;
        /** The date and time at which the comment was created. */
        created: string;
        /** The date and time at which the comment was updated last. */
        updated?: string;
        updateAuthor?: User;
    }

    /** Details of a link between issues. */
    export type IssueLink = {
        /** The ID of the issue link. */
        id: string;
        /** The URL of the issue link. */
        self: string;
        inwardIssue?: LinkedIssue;
        outwardIssue?: LinkedIssue;
        type: IssueLinkType;
    }

    /**
     * This object is used as follows:*
     *
     * - In the [issueLink](#api-rest-api-2-issueLink-post) resource it defines and reports on the type of link between the
     *   issues. Find a list of issue link types with [Get issue link types](#api-rest-api-2-issueLinkType-get).
     * - In the [issueLinkType](#api-rest-api-2-issueLinkType-post) resource it defines and reports on issue link types.
     */
    export type IssueLinkType = {
        /**
         * The ID of the issue link type and is used as follows:
         *
         * In the [issueLink](#api-rest-api-2-issueLink-post) resource it is the type of issue link. Required on create when
         * `name` isn't provided. Otherwise, read only. In the [ issueLinkType](#api-rest-api-2-issueLinkType-post) resource
         * it is read only.
         */
        id: string;
        /**
         * The name of the issue link type and is used as follows:
         *
         * In the [issueLink](#api-rest-api-2-issueLink-post) resource it is the type of issue link. Required on create when
         * `id` isn't provided. Otherwise, read only. In the [ issueLinkType](#api-rest-api-2-issueLinkType-post) resource it
         * is required on create and optional on update. Otherwise, read only.
         */
        name: string;
        /**
         * The description of the issue link type inward link and is used as follows:
         *
         * In the [issueLink](#api-rest-api-2-issueLink-post) resource it is read only. In the [
         * issueLinkType](#api-rest-api-2-issueLinkType-post) resource it is required on create and optional on update.
         * Otherwise, read only.
         */
        inward?: string;
        /**
         * The description of the issue link type outward link and is used as follows:
         *
         * In the [issueLink](#api-rest-api-2-issueLink-post) resource it is read only. In the [
         * issueLinkType](#api-rest-api-2-issueLinkType-post) resource it is required on create and optional on update.
         * Otherwise, read only.
         */
        outward?: string;
        /** The URL of the issue link type. Read only. */
        self: string;
    }

    export type Status = {
        self: string;
        description: string;
        iconUrl: string;
        name: string;
        id: string;
        statusCategory: StatusCategory;
    }

    /** A status category. */
    export type StatusCategory = {
        /** The name of the color used to represent the status category. */
        colorName: string;
        /** The ID of the status category. */
        id: number;
        /** The key of the status category. */
        key: string;
        /** The name of the status category. */
        name: string;
        /** The URL of the status category. */
        self: string;
    }

    export type Paged = {
        /** The maximum number of results that could be on the page. */
        maxResults?: number;
        /** The index of the first item returned on the page. */
        startAt?: number;
        /** The number of results on the page. */
        total?: number;
    }

    /**
     * User details permitted by the user's Atlassian Account privacy settings. However, be aware of these exceptions:*
     *
     * - User record deleted from Atlassian: This occurs as the result of a right to be forgotten request. In this case,
     *   `displayName` provides an indication and other parameters have default values or are blank (for example, email is
     *   blank).
     * - User record corrupted: This occurs as a results of events such as a server import and can only happen to deleted
     *   users. In this case, `accountId` returns _unknown_ and all other parameters have fallback values.
     * - User record unavailable: This usually occurs due to an internal service outage. In this case, all parameters have
     *   fallback values.
     */
    export type User = {
        /** The URL of the user. */
        self: string;
        name: string
        key: string
        /** The email address of the user. Depending on the user’s privacy settings, this may be returned as null. */
        emailAddress: string;
        avatarUrls: AvatarUrls;
        /** The display name of the user. Depending on the user’s privacy settings, this may return an alternative value. */
        displayName: string;
        /** Whether the user is active. */
        active: boolean;
        /**
         * The time zone specified in the user's profile. Depending on the user’s privacy settings, this may be returned as
         * null.
         */
        timeZone: string;
    }

    export type AvatarUrls = {
        /** The URL of the item's 16x16 pixel avatar. */
        '16x16': string;
        /** The URL of the item's 24x24 pixel avatar. */
        '24x24': string;
        /** The URL of the item's 32x32 pixel avatar. */
        '32x32': string;
        /** The URL of the item's 48x48 pixel avatar. */
        '48x48': string;
    }

    export type SprintString = `com.atlassian.greenhopper.service.sprint.Sprint@${string}[activatedDate=${string},autoStartStop=${boolean},completeDate=${string},endDate=${string},goal=${string},id=${number},incompleteIssuesDestinationId=<null>,name=${string},rapidViewId=${number},sequence=${number},startDate=${string},state=${string},synced=${boolean}]`
}
