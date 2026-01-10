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
    stars: totalStars,
    personalProjects: user.repositories.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
  };
}

async function getLanguageStats() {
  // Fetch all repos with their languages
  const query = `
    query {
      user(login: "${USERNAME}") {
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          nodes {
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await fetchGraphQL(query);
  const repos = data.data.user.repositories.nodes;

  // Aggregate language bytes across all repos
  const langBytes = {};
  for (const repo of repos) {
    for (const edge of repo.languages.edges) {
      const lang = edge.node.name;
      langBytes[lang] = (langBytes[lang] || 0) + edge.size;
    }
  }

  // Calculate total and percentages
  const total = Object.values(langBytes).reduce((a, b) => a + b, 0);
  const langPercents = Object.entries(langBytes)
    .map(([lang, bytes]) => ({ lang, percent: (bytes / total) * 100 }))
    .sort((a, b) => b.percent - a.percent);

  // Take top 4 and group rest as "Other"
  const top = langPercents.slice(0, 4);
  const otherPercent = langPercents.slice(4).reduce((sum, l) => sum + l.percent, 0);
  
  if (otherPercent > 0) {
    top.push({ lang: 'Other', percent: otherPercent });
  }

  return top;
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
  const languages = await getLanguageStats();
  
  // Format numbers with commas
  const format = (n) => n.toLocaleString('en-US');
  
  const statsLine = `I joined GitHub **${stats.years} years ago**. Since then I pushed **${format(allTimeCommits)} commits**, received **${format(stats.stars)} stars** across **${format(stats.personalProjects)} personal projects** and contributed to **${format(stats.contributedTo)} public repositories**.`;
  
  // Generate language text line
  const languageLine = languages.map(l => `**${l.lang}** (${l.percent.toFixed(1)}%)`).join(' · ');
  
  // Read current README
  let readme = fs.readFileSync('README.md', 'utf8');
  
  // Replace the stats line (matches the pattern)
  const statsRegex = /I joined GitHub \*\*\d+ years ago\*\*\. Since then I pushed \*\*[\d,]+ commits\*\*, received \*\*[\d,]+ stars\*\* across \*\*[\d,]+ personal projects\*\* and contributed to \*\*[\d,]+ public repositories\*\*\./;
  
  // Replace the languages line (matches pattern like "**C** 81.6% · **Java** 3.9% ...")
  const langRegex = /\*\*Most used languages:\*\* .+/;
  
  readme = readme.replace(statsRegex, statsLine);
  readme = readme.replace(langRegex, `**Most used languages:** ${languageLine}`);
  
  fs.writeFileSync('README.md', readme);
  
  console.log('README updated with new stats:');
  console.log(`  Years: ${stats.years}`);
  console.log(`  Commits: ${format(allTimeCommits)}`);
  console.log(`  Stars: ${format(stats.stars)}`);
  console.log(`  Personal Projects: ${format(stats.personalProjects)}`);
  console.log(`  Contributed To: ${format(stats.contributedTo)}`);
  console.log('  Languages:', languages.map(l => `${l.lang}: ${l.percent.toFixed(1)}%`).join(', '));
}

main().catch(console.error);
