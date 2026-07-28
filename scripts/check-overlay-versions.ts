/**
 * Checks that the plugin versions referenced in the rhdh-plugin-export-overlays
 * repository match the latest versions in their source repositories
 * (backstage/community-plugins and redhat-developer/rhdh-plugins).
 *
 * The locations of the local clones can be configured via the environment
 * variables BCP_DIR, OVERLAY_DIR, and RHDH_PLUGINS_DIR (set to the .clones
 * folders by the GitHub workflow). When they are not defined, the following
 * local folders are expected:
 *   ../../backstage/community-plugins     https://github.com/backstage/community-plugins
 *   ../../rhd/rhdh-plugin-export-overlays https://github.com/redhat-developer/rhdh-plugin-export-overlays
 *   ../../rhd/rhdh-plugins                https://github.com/redhat-developer/rhdh-plugins
 *
 * The script always exits with code 0; results are reported as a table.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';

const WORKSPACES = [
  'acr',
  'adoption-insights',
  'ai-integrations',
  'analytics',
  'app-defaults',
  'argocd',
  'bookmarks',
  'bulk-import',
  'extensions',
  'global-header',
  'homepage',
  'intelligent-assistant',
  'jfrog-artifactory',
  'mcp-chat',
  'multi-source-security-viewer',
  'nexus-repository-manager',
  'npm',
  'ocm',
  'orchestrator',
  'quay',
  'quickstart',
  'rbac',
  'scorecard',
  'servicenow',
  'tekton',
  'theme',
  'topology',
  'translations',
];

const BCP_DIR = process.env.BCP_DIR || '../../backstage/community-plugins';
const OVERLAY_DIR = process.env.OVERLAY_DIR || '../../rhd/rhdh-plugin-export-overlays';
const RHDH_PLUGINS_DIR = process.env.RHDH_PLUGINS_DIR || '../../rhd/rhdh-plugins';

/** Known source repositories mapped to their local clone directories. */
const KNOWN_REPOS: Record<string, string> = {
  'https://github.com/backstage/community-plugins': BCP_DIR,
  'https://github.com/redhat-developer/rhdh-plugins': RHDH_PLUGINS_DIR,
};

interface Row {
  workspace: string;
  packageFolder: string;
  backstageVersion: string;
  packageName: string;
  packageVersion: string;
  status: string;
}

function normalizeRepoUrl(url: string): string {
  return url.replace(/\.git$/, '').replace(/\/+$/, '');
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Loads all metadata yamls of a workspace, keeping the parse result per file. */
function loadMetadataFiles(
  workspace: string,
): { file: string; doc: any }[] {
  const metadataDir = path.join(OVERLAY_DIR, 'workspaces', workspace, 'metadata');
  if (!fs.existsSync(metadataDir)) {
    return [];
  }
  return fs
    .readdirSync(metadataDir)
    .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
    .map(file => {
      const fullPath = path.join(metadataDir, file);
      try {
        return { file, doc: YAML.parse(fs.readFileSync(fullPath, 'utf8')) };
      } catch (error) {
        return { file, doc: undefined };
      }
    });
}

function checkWorkspace(workspace: string): Row[] {
  const rows: Row[] = [];
  const workspaceDir = path.join(OVERLAY_DIR, 'workspaces', workspace);

  // 1. Load the source.json from the overlay repository.
  const sourceJsonPath = path.join(workspaceDir, 'source.json');
  let source: any;
  try {
    source = readJson(sourceJsonPath);
  } catch (error) {
    rows.push({
      workspace,
      packageFolder: '',
      backstageVersion: '',
      packageName: '',
      packageVersion: '',
      status: `ERROR: could not read ${sourceJsonPath}: ${(error as Error).message}`,
    });
    return rows;
  }

  const repoUrl = normalizeRepoUrl(String(source.repo ?? ''));
  const sourceRepoDir = KNOWN_REPOS[repoUrl];
  if (!sourceRepoDir) {
    rows.push({
      workspace,
      packageFolder: '',
      backstageVersion: '',
      packageName: '',
      packageVersion: '',
      status: `ERROR: unknown source repository '${source.repo}'`,
    });
    return rows;
  }

  // 2. Read the backstage.json in the source repository.
  let backstageVersion = '';
  const backstageJsonPath = path.join(sourceRepoDir, 'workspaces', workspace, 'backstage.json');
  try {
    backstageVersion = String(readJson(backstageJsonPath).version ?? '');
  } catch (error) {
    backstageVersion = '';
  }

  // 3. Load the package folders (keys) from plugins-list.yaml.
  const pluginsListPath = path.join(workspaceDir, 'plugins-list.yaml');
  let packageFolders: string[];
  try {
    const pluginsList = YAML.parse(fs.readFileSync(pluginsListPath, 'utf8'));
    packageFolders = Object.keys(pluginsList ?? {});
  } catch (error) {
    rows.push({
      workspace,
      packageFolder: '',
      backstageVersion,
      packageName: '',
      packageVersion: '',
      status: `ERROR: could not read ${pluginsListPath}: ${(error as Error).message}`,
    });
    return rows;
  }
  if (packageFolders.length === 0) {
    rows.push({
      workspace,
      packageFolder: '',
      backstageVersion,
      packageName: '',
      packageVersion: '',
      status: `ERROR: no package folders found in ${pluginsListPath}`,
    });
    return rows;
  }

  const metadataFiles = loadMetadataFiles(workspace);

  for (const packageFolder of packageFolders) {
    const row: Row = {
      workspace,
      packageFolder,
      backstageVersion,
      packageName: '',
      packageVersion: '',
      status: 'OK',
    };
    rows.push(row);
    const errors: string[] = [];

    // 3.1. Read the package.json in the source repository.
    const packageJsonPath = path.join(
      sourceRepoDir,
      'workspaces',
      workspace,
      packageFolder,
      'package.json',
    );
    let packageJson: any;
    try {
      packageJson = readJson(packageJsonPath);
    } catch (error) {
      row.status = `ERROR: could not read ${packageJsonPath}: ${(error as Error).message}`;
      continue;
    }
    row.packageName = String(packageJson.name ?? '');
    row.packageVersion = String(packageJson.version ?? '');

    // 3.2. There must be exactly one metadata yaml whose spec.packageName
    // matches. Package folders ending with '-test' don't necessarily need
    // a metadata yaml.
    const matches = metadataFiles.filter(
      ({ doc }) => doc?.spec?.packageName === row.packageName,
    );
    if (matches.length === 0 && packageFolder.endsWith('-test')) {
      row.status = 'OK (test package without metadata)';
    } else if (matches.length !== 1) {
      errors.push(
        `expected exactly 1 metadata yaml with spec.packageName '${row.packageName}', found ${matches.length}`,
      );
    } else {
      const { file, doc } = matches[0];

      // 3.3. spec.dynamicArtifact must end with '__' + the package version.
      // Some artifacts carry an additional '!<export name>' suffix which is
      // ignored for this check.
      const dynamicArtifact = String(doc.spec?.dynamicArtifact ?? '');
      const expectedSuffix = `__${row.packageVersion}`;
      if (!dynamicArtifact.replace(/![^!]*$/, '').endsWith(expectedSuffix)) {
        errors.push(
          `${file}: spec.dynamicArtifact '${dynamicArtifact}' does not end with '${expectedSuffix}'`,
        );
      }

      // 3.4. spec.version must match the package version.
      const metadataVersion = String(doc.spec?.version ?? '');
      if (metadataVersion !== row.packageVersion) {
        errors.push(
          `${file}: spec.version '${metadataVersion}' does not match package version '${row.packageVersion}'`,
        );
      }
    }

    if (errors.length > 0) {
      row.status = `ERROR: ${errors.join('; ')}`;
    }
  }

  return rows;
}

const HEADERS = [
  'Overlay workspace',
  'Overlay package folder',
  'Source backstage version',
  'Source package name',
  'Source package version',
  'Status / Error',
];

function toCells(row: Row): string[] {
  return [
    row.workspace,
    row.packageFolder,
    row.backstageVersion,
    row.packageName,
    row.packageVersion,
    row.status,
  ];
}

function printTable(rows: Row[]) {
  const table = [HEADERS, ...rows.map(toCells)];
  const widths = HEADERS.map((_, column) =>
    Math.max(...table.map(cells => cells[column].length)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
  const separator = `| ${widths.map(width => '-'.repeat(width)).join(' | ')} |`;

  console.log(line(HEADERS));
  console.log(separator);
  for (const row of rows) {
    console.log(line(toCells(row)));
  }
}

/** Writes the results as a markdown table to the GitHub job summary, if available. */
function writeGitHubSummary(rows: Row[]) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) {
    return;
  }
  const escape = (cell: string) => cell.replace(/\|/g, '\\|');
  const lines = [
    '## Overlay version check',
    '',
    `| ${HEADERS.join(' | ')} |`,
    `| ${HEADERS.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${toCells(row).map(escape).join(' | ')} |`),
    '',
  ];
  fs.appendFileSync(summaryFile, lines.join('\n'));
}

const rows = WORKSPACES.flatMap(checkWorkspace);

printTable(rows);
writeGitHubSummary(rows);

const errorCount = rows.filter(row => !row.status.startsWith('OK')).length;
console.log();
console.log(`${rows.length} checks, ${rows.length - errorCount} ok, ${errorCount} with errors.`);
