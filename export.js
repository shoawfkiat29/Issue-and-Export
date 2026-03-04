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
// ------------------------------------
// 1️⃣ Fetch GitHub Issues (Last 24 Hours)
// ------------------------------------
async function fetchGitHubIssues() {

  // Get time for 24 hours ago
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const since = yesterday.toISOString();

  console.log(`Fetching GitHub issues updated since: ${since}`);

  try {

    const res = await axios.get(
      `https://api.github.com/repos/${githubRepo}/issues`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
        },
        params: {
          since: since
        }
      }
    );

    // Remove pull requests (GitHub returns PRs in issues API)
    const issues = res.data.filter(issue => !issue.pull_request);

    console.log(`Fetched ${issues.length} recent issues`);

    return issues;

  } catch (error) {

    console.error(
      "Error fetching GitHub issues:",
      error.response?.data || error.message
    );

    return [];
  }
}
// 2️⃣ Check if Jira Issue Already Exists
// ------------------------------------
async function jiraIssueExists(githubIssueNumber) {

  const jqlQuery = `project = ${config.jira.projectKey} AND text ~ "GitHub Issue #${githubIssueNumber}"`;

  const res = await axios.post(
    `${jiraBase}/rest/api/3/search/jql`,
    {
      jql: jqlQuery,
      maxResults: 1
    },
    {
      auth: {
        username: jiraEmail,
        password: jiraToken,
      },
      headers: {
        "Content-Type": "application/json"
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

  let priorityName = "Medium";
  if (labelNames.includes("high")) priorityName = "High";
  if (labelNames.includes("low")) priorityName = "Low";

  const descriptionADF = {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: `GitHub Issue #${issue.number}` }
        ]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: `GitHub Link: ${issue.html_url}` }
        ]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: `Created: ${issue.created_at}` }
        ]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: `Updated: ${issue.updated_at}` }
        ]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: issue.body || "No description provided." }
        ]
      }
    ]
  };

  return {
    project: { key: config.jira.projectKey },
    summary: issue.title,
    description: descriptionADF,
    issuetype: { name: config.jira.defaultIssueType },
    labels: labelNames,
    priority: { name: priorityName }
  };
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
