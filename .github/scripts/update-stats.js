const fs = require('fs');

const TOKEN = process.env.GH_TOKEN;
const USERNAME = process.env.USERNAME || 'thisisyashgarg';

async function fetchGraphQL(query) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

async function getStats() {
  const query = `
    query {
      user(login: "${USERNAME}") {
        createdAt
        contributionsCollection {
          totalCommitContributions
          restrictedContributionsCount
        }
        repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
          totalCount
        }
        pullRequests(first: 1) {
          totalCount
        }
        issues(first: 1) {
          totalCount
        }
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          totalCount
          nodes {
            stargazerCount
          }
        }
      }
    }
  `;

  const data = await fetchGraphQL(query);
  const user = data.data.user;

  // Calculate years on GitHub
  const createdAt = new Date(user.createdAt);
  const now = new Date();
  const years = Math.floor((now - createdAt) / (365.25 * 24 * 60 * 60 * 1000));

  // Get total stars across all repos
  const totalStars = user.repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0);

  // For total commits, we need to query year by year (GitHub API limitation)
  // Using contributions collection for current year + estimate
  // For accurate all-time commits, we'd need multiple queries
  
  return {
    years,
    commits: user.contributionsCollection.totalCommitContributions + user.contributionsCollection.restrictedContributionsCount,
    issues: user.issues.totalCount,
    pullRequests: user.pullRequests.totalCount,
    stars: totalStars,
    personalProjects: user.repositories.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
  };
}

async function getAllTimeCommits() {
  // Fetch commits across all years since account creation
  const userQuery = `
    query {
      user(login: "${USERNAME}") {
        createdAt
      }
    }
  `;
  
  const userData = await fetchGraphQL(userQuery);
  const createdYear = new Date(userData.data.user.createdAt).getFullYear();
  const currentYear = new Date().getFullYear();
  
  let totalCommits = 0;
  
  for (let year = createdYear; year <= currentYear; year++) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;
    
    const query = `
      query {
        user(login: "${USERNAME}") {
          contributionsCollection(from: "${from}", to: "${to}") {
            totalCommitContributions
            restrictedContributionsCount
          }
        }
      }
    `;
    
    const data = await fetchGraphQL(query);
    const contributions = data.data.user.contributionsCollection;
    totalCommits += contributions.totalCommitContributions + contributions.restrictedContributionsCount;
  }
  
  return totalCommits;
}

async function main() {
  if (!TOKEN) {
    console.error('GH_TOKEN environment variable is required');
    process.exit(1);
  }

  console.log('Fetching GitHub stats...');
  
  const stats = await getStats();
  const allTimeCommits = await getAllTimeCommits();
  
  // Format numbers with commas
  const format = (n) => n.toLocaleString('en-US');
  
  const statsLine = `I joined GitHub **${stats.years} years ago**. Since then I pushed **${format(allTimeCommits)} commits**, opened **${format(stats.issues)} issues**, submitted **${format(stats.pullRequests)} pull requests**, received **${format(stats.stars)} stars** across **${format(stats.personalProjects)} personal projects** and contributed to **${format(stats.contributedTo)} public repositories**.`;
  
  // Read current README
  const readme = fs.readFileSync('README.md', 'utf8');
  
  // Replace the stats line (matches the pattern)
  const statsRegex = /I joined GitHub \*\*\d+ years ago\*\*\. Since then I pushed \*\*[\d,]+ commits\*\*, opened \*\*[\d,]+ issues\*\*, submitted \*\*[\d,]+ pull requests\*\*, received \*\*[\d,]+ stars\*\* across \*\*[\d,]+ personal projects\*\* and contributed to \*\*[\d,]+ public repositories\*\*\./;
  
  const newReadme = readme.replace(statsRegex, statsLine);
  
  fs.writeFileSync('README.md', newReadme);
  
  console.log('README updated with new stats:');
  console.log(`  Years: ${stats.years}`);
  console.log(`  Commits: ${format(allTimeCommits)}`);
  console.log(`  Issues: ${format(stats.issues)}`);
  console.log(`  PRs: ${format(stats.pullRequests)}`);
  console.log(`  Stars: ${format(stats.stars)}`);
  console.log(`  Personal Projects: ${format(stats.personalProjects)}`);
  console.log(`  Contributed To: ${format(stats.contributedTo)}`);
}

main().catch(console.error);
