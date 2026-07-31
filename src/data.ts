import type {ElementDefinition} from 'cytoscape'
import pings from '../data/comment-pings.json' with { type: 'json'}
// import components from '../data/components.json' with { type: 'json'}
// import issueLinkTypes from '../data/issueLinkTypes.json' with { type: 'json'}
// import issues from '../data/issues.json' with { type: 'json'}
// import links from '../data/links.json' with { type: 'json'}
// import sprints from '../data/sprints.json' with { type: 'json'}
// import statuses from '../data/statuses.json' with { type: 'json'}
// import types from '../data/types.json' with { type: 'json'}
import users from '../data/users.json' with { type: 'json'}

export const usersForCytoscape = Object.values(users).map<ElementDefinition>(user => ({
   group: 'nodes',
   data: {
       id: user.key,
       displayName: user.displayName,
   }
}))

export const commentPings =  Object.entries(pings).flatMap<ElementDefinition>(([user, issuesPings]) => {
    return Object.entries(issuesPings).flatMap(([issue, comments]) => {
        return comments.flatMap(comment => {
            return comment.mentionedUsers
                .filter(mentionedUser => !!users[mentionedUser])
                .map(mentionedUser => ({
                group: 'edges',
                data: {
                    id: `${user}-${issue}-${comment.comment}-${mentionedUser}`,
                    source: user,
                    target: mentionedUser,
                }
            }))
        })
    })
})
