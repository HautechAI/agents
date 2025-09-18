import { EngineeringAgent } from "./agents/engineering.agent";
import { ConfigService } from "./services/config.service";
import { GithubService } from "./services/github.service";
import { LoggerService } from "./services/logger.service";
import { PRService } from "./services/pr.service";

const configService = ConfigService.fromEnv();
const logger = new LoggerService();
const githubService = new GithubService(configService);
const prService = new PRService(githubService);
const engineeringAgent = new EngineeringAgent(configService);

const owner = "HautechAI";
const repo = "liana";

const myPrs = await githubService.listAssignedOpenPullRequestsForRepo(owner, repo);
const prInfo = await prService.getPRInfo(owner, repo, myPrs[0].number);

console.log("PR Info:", prInfo);

const Instructions = `
You are Soren Wilde - Engineering Manager. You role is to review PRs, manage high standard of work execution, make sure engineering team delivers high quality code and executes tasks according to the task definition.
- Make sure that code is implemented according to the task definition. If you see that task is not properly implemented, request changes and provide detailed explanation what is missing and how it should be implemented.
- Make sure all checks (linter, tests, e2e tests) are passing. If not, request changes and provide detailed explanation what is missing.
- Make sure all change requests from other reviewers are addressed. If not, request changes and provide detailed explanation what is missing.

You submit tasks to engineers via work_with_pr tool.
`;

const response = await engineeringAgent.createAgent().invoke(
  {
    messages: [
      { role: "system", content: Instructions },
      {
        role: "user",
        // content: "Analyze code of all cloned repos and create documentation. Check every file. Understand logic inside and reason why it was created. Understand and record internal logic of projects and relation between them. Iterate until all repos are fully documented.",
        // content: "Analyze code of core-api and find how operations are created from the pipeline",
        // content: "Analyze code of core-api (document all findings on the way). 1. Find what happens when workflow is executed. It should be the following process: workflow->pipeline->operation->resource. 2. Understand how all these entities are created. 3. Find how perrmissions attachment for resources is implemented. 4. Describe task for engineer to implement proper attachment of permissions: resource to operation, operation to pipeline, pipeline to workflow. So when workflow is shared to another user access to all produced resources will be shared automatically.",
        // content: "Use docs as the first source and analyze code to double check facts and find missing infromation (document all findings on the way). We have multiple instances of Studio running as whitelabel. One of the clients wants specific metrics code to be included in their version on front end. We want to make it configurable so every time they want to change it doesn't involve us and redeployment of the platform. What are the options to implement it?",
        content:
          "Use docs as the first source and analyze code to double check facts and find missing infromation (document all findings on the way). We would like to let users to create custom models (ethnicities) and backgrounds in studio available only for them. Describe task for engineers.",
      },
    ],
  },
  { recursionLimit: 250 },
);
