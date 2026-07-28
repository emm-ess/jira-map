import fs from 'node:fs'
import path from 'node:path'
import type {DataRaw} from '../types/data-raw.js'
import type {Data} from '../types/data.js'

// scrapping the data via this script was planned but the instance doesn't allow it. So it's manually downloaded
// files and a script for data reduction/extraction

const exampleSprintString: DataRaw.SprintString[] = [
    "com.atlassian.greenhopper.service.sprint.Sprint@4acd88c6[activatedDate=2021-03-04T12:58:55.080+01:00,autoStartStop=false,completeDate=2021-03-24T18:11:43.487+01:00,endDate=2021-03-24T13:47:00.000+01:00,goal=Pia und Pia mobil wird eins.,id=967,incompleteIssuesDestinationId=<null>,name=DBI Sprint 8 (4.3.-24.3.),rapidViewId=164,sequence=967,startDate=2021-03-04T12:58:55.080+01:00,state=CLOSED,synced=false]",
    "com.atlassian.greenhopper.service.sprint.Sprint@18ad89dd[activatedDate=2021-03-25T10:11:47.352+01:00,autoStartStop=false,completeDate=2021-04-14T17:05:17.511+02:00,endDate=2021-04-14T11:00:00.000+02:00,goal=Wir können schnell liefern!,id=996,incompleteIssuesDestinationId=<null>,name=DBI Sprint 9 (25.3.-14.4.),rapidViewId=164,sequence=996,startDate=2021-03-25T10:11:47.352+01:00,state=CLOSED,synced=false]",
]

const inputDir = path.resolve(import.meta.dirname, '../data-raw')
const outputDir = path.resolve(import.meta.dirname, '../data')

const user = new Map<string, Data.User>()
const sprints = new Map<string, Data.Sprint>()
const components = new Map<string, Data.Component>()
const links = new Map<string, Data.IssueLink>()
const statuses = new Map<string, Data.Status>()
const type = new Map<string, Data.IssueType>()
const issues: Data.Issue[] = []

function processSprintString(sprintString: DataRaw.SprintString[] | null): string[] | null {

}

function processIssue(issue: DataRaw.Issue) {
    const sprintIds = processSprintString(issue.fields.customfield_10005)
}

fs.readdirSync(inputDir, {withFileTypes: true})
    .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
    .forEach(async (dirent) => {
        process.stdout.write(`\r${dirent.name}`)
        const file = path.resolve(inputDir, dirent.name)
        const content = await import(file, {with: {type: 'json'}}) as DataRaw.File
        content.issues.forEach((issue) => {
            process.stdout.write(`\r${issue.key}`)
            processIssue(issue)
        })
        process.stdout.write(`\r${dirent.name} done`)
    })
