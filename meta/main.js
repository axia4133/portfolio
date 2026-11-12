import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { REPO_URL } from './config.js';

// Lab 6: line-level Git data is generated with elocuent, not invented here.
// npm install elocuent -D
// npx elocuent -d . -o meta/loc.csv --spaces 2

const tooltip = document.querySelector('#commit-tooltip');
let tooltipHideTimer;

async function loadData() {
  return d3.csv('./loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(`${row.date}T00:00${row.timezone || ''}`),
    datetime: new Date(row.datetime),
  }));
}

function processCommits(data) {
  return d3.groups(data, (d) => d.commit)
    .filter(([id, lines]) => id && lines.length)
    .map(([id, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;
      const commit = {
        id,
        url: `${REPO_URL.replace(/\/$/, '')}/commit/${id}`,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // Preserve all attributed lines for Step 5's language breakdown
      // without making console-printed commit objects unwieldy.
      Object.defineProperty(commit, 'lines', {
        value: lines,
        enumerable: false,
        writable: false,
      });
      return commit;
    })
    .filter((commit) => Number.isFinite(commit.datetime.getTime()));
}

function renderCommitInfo(data, commits) {
  const fileLengths = d3.rollups(
    data,
    (lines) => d3.max(lines, (d) => d.line),
    (d) => d.file,
  );
  const longestFile = d3.greatest(fileLengths, (item) => item[1]);
  const averageLineLength = d3.mean(data, (d) => d.length);

  const stats = [
    ['Total LOC', data.length.toLocaleString()],
    ['Total commits', commits.length.toLocaleString()],
    ['Files', d3.group(data, (d) => d.file).size.toLocaleString()],
    ['Authors', d3.group(data, (d) => d.author).size.toLocaleString()],
    ['Avg. line length', `${averageLineLength.toFixed(1)} characters`],
    ['Max indent depth', d3.max(data, (d) => d.depth)],
  ];

  const list = d3.select('#stats')
    .html('')
    .append('dl')
    .attr('class', 'meta-stats');

  for (const [label, value] of stats) {
    const item = list.append('div').attr('class', 'meta-stat');
    item.append('dt').text(label);
    item.append('dd').text(value);
  }

  if (longestFile) {
    const item = list.append('div').attr('class', 'meta-stat meta-stat--long');
    item.append('dt').text('Longest file');
    item.append('dd').text(`${longestFile[0]} (${longestFile[1]} lines)`);
  }
}

function renderTooltipContent(commit) {
  const link = document.querySelector('#commit-link');
  link.href = commit.url;
  link.textContent = commit.id.slice(0, 9);
  document.querySelector('#commit-date').textContent =
    commit.datetime.toLocaleDateString('en-US', { dateStyle: 'full' });
  document.querySelector('#commit-time').textContent =
    commit.datetime.toLocaleTimeString('en-US', { timeStyle: 'short' });
  document.querySelector('#commit-author').textContent = commit.author || 'Unknown';
  document.querySelector('#commit-lines').textContent = commit.totalLines.toLocaleString();
}

function updateTooltipVisibility(isVisible) {
  if (isVisible) clearTimeout(tooltipHideTimer);
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  // Keep the tooltip fully within the viewport, including near its right edge.
  const margin = 10;
  const left = Math.min(
    event.clientX + 15,
    window.innerWidth - tooltip.offsetWidth - margin,
  );
  const top = Math.min(
    event.clientY + 15,
    window.innerHeight - tooltip.offsetHeight - margin,
  );
  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function renderLanguageBreakdown(selectedCommits) {
  const list = d3.select('#language-breakdown').html('');

  if (!selectedCommits.length) {
    list.append('div')
      .attr('class', 'meta-empty')
      .text('Select some commits in the chart to see the breakdown.');
    return;
  }

  const lines = selectedCommits.flatMap((commit) => commit.lines);
  const byLanguage = d3.rollups(
    lines,
    (group) => group.length,
    (d) => d.type || 'Other',
  ).sort((a, b) => d3.descending(a[1], b[1]));

  for (const [language, count] of byLanguage) {
    const ratio = count / lines.length;
    const item = list.append('div').attr('class', 'meta-language-row');
    item.append('dt').text(language);
    item.append('dd').text(`${count} lines (${d3.format('.1~%')(ratio)})`);
    item.append('div').attr('class', 'meta-language-meter')
      .append('span')
      .style('width', `${ratio * 100}%`);
  }
}

function renderScatterPlot(commits) {
  const width = 960;
  const height = 540;
  const margin = { top: 25, right: 25, bottom: 65, left: 76 };
  const area = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3.select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Commit dates versus time of day, with dot area proportional to surviving lines');

  const extent = d3.extent(commits, (d) => d.datetime);
  // A single commit can otherwise produce a degenerate X domain.
  if (+extent[0] === +extent[1]) {
    extent[0] = new Date(+extent[0] - 86400000);
    extent[1] = new Date(+extent[1] + 86400000);
  }
  const xScale = d3.scaleTime().domain(extent)
    .range([area.left, area.right]).nice();
  const yScale = d3.scaleLinear().domain([0, 24])
    .range([area.bottom, area.top]);

  const maxLines = d3.max(commits, (d) => d.totalLines);
  // Square-root scaling is appropriate because the viewer sees circle area.
  const rScale = d3.scaleSqrt().domain([0, maxLines])
    .range([2.5, 24]);

  const yTicks = d3.range(0, 25, 4);
  svg.append('g')
    .attr('class', 'meta-gridlines')
    .attr('transform', `translate(${area.left}, 0)`)
    .call(d3.axisLeft(yScale).tickValues(yTicks)
      .tickSize(-area.width).tickFormat(''));

  svg.append('g')
    .attr('class', 'meta-axis')
    .attr('transform', `translate(0, ${area.bottom})`)
    .call(d3.axisBottom(xScale).ticks(6).tickSizeOuter(0));

  svg.append('g')
    .attr('class', 'meta-axis')
    .attr('transform', `translate(${area.left}, 0)`)
    .call(d3.axisLeft(yScale).tickValues(yTicks)
      .tickFormat((hour) => `${String(hour % 24).padStart(2, '0')}:00`));

  svg.append('text')
    .attr('class', 'meta-axis-label')
    .attr('x', (area.left + area.right) / 2)
    .attr('y', height - 9)
    .attr('text-anchor', 'middle')
    .text('Commit date');

  svg.append('text')
    .attr('class', 'meta-axis-label')
    .attr('transform', `translate(18, ${(area.top + area.bottom) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .text('Time of day (local)');

  function isCommitSelected(selection, commit) {
    if (!selection) return false;
    const [[x0, y0], [x1, y1]] = selection;
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);
    return x0 <= x && x <= x1 && y0 <= y && y <= y1;
  }

  const dots = svg.append('g').attr('class', 'meta-dots');

  function brushed(event) {
    const selection = event.selection;
    const selectedCommits = selection
      ? commits.filter((commit) => isCommitSelected(selection, commit))
      : [];

    dots.selectAll('circle')
      .classed('is-selected', (commit) => isCommitSelected(selection, commit))
      .classed('is-dimmed', (commit) => selection && !isCommitSelected(selection, commit));

    const label = selectedCommits.length === 1
      ? '1 commit selected'
      : selectedCommits.length
        ? `${selectedCommits.length} commits selected`
        : 'No commits selected';
    document.querySelector('#selection-count').textContent = label;
    renderLanguageBreakdown(selectedCommits);
    updateTooltipVisibility(false);
  }

  // Brush layer below dots: hovering and keyboard focus still reach circles.
  const brush = d3.brush()
    .extent([[area.left, area.top], [area.right, area.bottom]])
    .on('start brush end', brushed);
  const brushLayer = svg.append('g')
    .attr('class', 'meta-brush')
    .call(brush);
  // The SVG brush overlay must remain BEHIND the dots for hover tooltips.
  dots.raise();

  // Larger circles go behind smaller ones, making overlapping small dots usable.
  const sortedCommits = d3.sort(commits, (commit) => -commit.totalLines);
  dots.selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', (commit) => xScale(commit.datetime))
    .attr('cy', (commit) => yScale(commit.hourFrac))
    .attr('r', (commit) => rScale(commit.totalLines))
    .attr('tabindex', 0)
    .attr('aria-label', (commit) =>
      `${commit.author || 'Unknown'}: ${commit.totalLines} lines on ${commit.datetime.toLocaleString('en-US')}`)
    .on('mouseenter', (event, commit) => {
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => updateTooltipPosition(event))
    .on('mouseleave', () => {
      clearTimeout(tooltipHideTimer);
      tooltipHideTimer = setTimeout(() => updateTooltipVisibility(false), 200);
    })
    .on('focus', (event, commit) => {
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      const bounds = event.currentTarget.getBoundingClientRect();
      updateTooltipPosition({ clientX: bounds.left, clientY: bounds.bottom });
    })
    .on('blur', () => updateTooltipVisibility(false));

  document.querySelector('#clear-selection')
    .addEventListener('click', () => brushLayer.call(brush.move, null));

  renderLanguageBreakdown([]);
}

// Allows the pointer to move from a dot to the tooltip's GitHub commit link.
tooltip.addEventListener('mouseenter', () => clearTimeout(tooltipHideTimer));
tooltip.addEventListener('mouseleave', () => updateTooltipVisibility(false));

async function main() {
  try {
    const data = (await loadData()).filter((row) =>
      row.commit && row.file && Number.isFinite(row.datetime.getTime()));
    if (data.length === 0) {
      throw new Error('loc.csv does not contain valid line-level Git data.');
    }
    const commits = processCommits(data);
    if (!commits.length) {
      throw new Error('No commits could be extracted from meta/loc.csv.');
    }

    renderCommitInfo(data, commits);
    renderScatterPlot(commits);
  } catch (error) {
    console.error('Lab 6 could not load the Git analysis:', error);
    document.querySelector('#stats').textContent = 'Statistics are unavailable.';
    const message = document.querySelector('#error');
    message.hidden = false;
    message.textContent =
      `Could not load the analysis: ${error.message} ` +
      'Run "npx elocuent -d . -o meta/loc.csv --spaces 2" from your portfolio folder, ' +
      'then open the site with VS Code Live Server (not by double-clicking the HTML file).';
  }
}

main();
