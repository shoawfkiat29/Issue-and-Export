const fs = require("fs");
const axios = require("axios");

const config = JSON.parse(
  fs.readFileSync(".github/config/jira-config.json")
);

const githubToken = process.env.GITHUB_TOKEN;
const jiraEmail = process.env.JIRA_EMAIL;
const jiraToken = process.env.JIRA_API_TOKEN;
const jiraBase = process.env.JIRA_BASE_URL;

// 1️⃣ Fetch GitHub issues
async function fetchGitHubIssues() {
  const res = await axios.get(
    "https://api.github.com/repos/" +
      process.env.GITHUB_REPOSITORY +
      "/issues",
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
      },
    }
  );
  return res.data;
}

// 2️⃣ Create Jira issue
async function createJiraIssue(issue) {
  await axios.post(
    `${jiraBase}/rest/api/3/issue`,
    {
      fields: {
        project: {
          key: config.jira.projectKey,
        },
        summary: issue.title,
        description: issue.body,
        issuetype: {
          name: config.jira.defaultIssueType,
        },
      },
    },
    {
      auth: {
        username: jiraEmail,
        password: jiraToken,
      },
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

// 3️⃣ Main function
async function main() {
  const issues = await fetchGitHubIssues();

  for (const issue of issues) {
    await createJiraIssue(issue);
  }

  console.log("Export completed!");
}

main();
