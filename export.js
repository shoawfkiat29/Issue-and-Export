const fs = require("fs");
const axios = require("axios");

// Load config
const config = JSON.parse(
  fs.readFileSync(".github/config/jira-config.json", "utf8")
);

const githubToken = process.env.GITHUB_TOKEN;
const jiraEmail = process.env.JIRA_EMAIL;
const jiraToken = process.env.JIRA_API_TOKEN;
const jiraBase = process.env.JIRA_BASE_URL;

const githubRepo = process.env.GITHUB_REPOSITORY;

// ------------------------------------
// 1️⃣ Fetch GitHub Issues
// ------------------------------------
async function fetchGitHubIssues() {
  const res = await axios.get(
    `https://api.github.com/repos/${githubRepo}/issues`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
      },
    }
  );

  // Ignore pull requests (GitHub returns PRs also)
  return res.data.filter(issue => !issue.pull_request);
}

// ------------------------------------
// 2️⃣ Check if Jira Issue Already Exists
// ------------------------------------
async function jiraIssueExists(githubIssueNumber) {
  const jql = `project = ${config.jira.projectKey} AND text ~ "GitHub Issue #${githubIssueNumber}"`;

  const res = await axios.get(
    `${jiraBase}/rest/api/3/search`,
    {
      params: { jql },
      auth: {
        username: jiraEmail,
        password: jiraToken,
      }
    }
  );

  return res.data.total > 0;
}

// ------------------------------------
// 3️⃣ Map GitHub Issue → Jira Format
// ------------------------------------
function mapGitHubToJira(issue) {
  const labelNames = issue.labels.map(l => l.name);

  // Priority detection from labels
  let priorityName = "Medium";
  if (labelNames.includes("high")) priorityName = "High";
  if (labelNames.includes("low")) priorityName = "Low";

  // Optional assignee mapping (edit manually)
  const userMap = {
    // "githubUsername": "jiraAccountId"
  };

  let assigneeField = undefined;
  if (issue.assignee && userMap[issue.assignee.login]) {
    assigneeField = {
      id: userMap[issue.assignee.login]
    };
  }

  const fields = {
    project: { key: config.jira.projectKey },

    summary: issue.title,

    description: `
GitHub Issue #${issue.number}
GitHub Link: ${issue.html_url}

Created: ${issue.created_at}
Updated: ${issue.updated_at}

-------------------------------------

${issue.body || "No description provided."}
    `,

    issuetype: {
      name: config.jira.defaultIssueType
    },

    labels: labelNames,

    priority: {
      name: priorityName
    }
  };

  if (assigneeField) {
    fields.assignee = assigneeField;
  }

  return fields;
}

// ------------------------------------
// 4️⃣ Create Jira Issue
// ------------------------------------
async function createJiraIssue(issue) {

  const exists = await jiraIssueExists(issue.number);

  if (exists) {
    console.log(`Skipped (already exported): #${issue.number}`);
    return;
  }

  const mappedFields = mapGitHubToJira(issue);

  await axios.post(
    `${jiraBase}/rest/api/3/issue`,
    {
      fields: mappedFields
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

  console.log(`Exported: #${issue.number} - ${issue.title}`);
}

// ------------------------------------
// 5️⃣ Main Execution
// ------------------------------------
async function main() {
  try {
    const issues = await fetchGitHubIssues();

    for (const issue of issues) {
      await createJiraIssue(issue);
    }

    console.log("Export completed successfully!");
  } catch (error) {
    console.error("Error during export:", error.response?.data || error.message);
  }
}

main();
