
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');

projectsTitle.textContent = `My Projects (${projects.length})`;

let query = '';
let selectedYear = null;

let searchInput = document.querySelector('.searchBar');

let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
let colors = d3.scaleOrdinal(d3.schemeTableau10);

// Draw the pie chart and legend
function renderPieChart(projectsGiven) {
    let rolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year
    );

    let data = rolledData.map(([year, count]) => {
        return { value: count, label: year };
    });

    let sliceGenerator = d3.pie().value((d) => d.value);
    let arcData = sliceGenerator(data);
    let arcs = arcData.map((d) => arcGenerator(d));

    let svg = d3.select('#projects-pie-plot');
    let legend = d3.select('.legend');

    // Clear the previous chart and legend
    svg.selectAll('path').remove();
    legend.selectAll('li').remove();

    // Draw pie slices
    arcs.forEach((arc, idx) => {
        let year = data[idx].label;

        svg
            .append('path')
            .attr('d', arc)
            .attr('fill', colors(idx))
            .attr('class', selectedYear === year ? 'selected' : '')
            .on('click', () => {
                selectedYear = selectedYear === year ? null : year;
                updateDisplay();
            });
    });

    // Draw legend items
    data.forEach((d, idx) => {
        legend
            .append('li')
            .attr('style', `--color: ${colors(idx)}`)
            .attr(
                'class',
                selectedYear === d.label
                    ? 'legend-item selected'
                    : 'legend-item'
            )
            .html(
                `<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`
            )
            .on('click', () => {
                selectedYear = selectedYear === d.label
                    ? null
                    : d.label;
                updateDisplay();
            });
    });
}

// Apply both filters and update the page
function updateDisplay() {
    // First, filter by search query
    let searchProjects = projects.filter((project) => {
        let values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });

    // Then, filter by selected year
    let filteredProjects = searchProjects.filter((project) => {
        return selectedYear === null || project.year === selectedYear;
    });

    // Update project cards
    renderProjects(filteredProjects, projectsContainer, 'h2');

    // Update pie chart based on search results
    renderPieChart(searchProjects);
}

// Update everything when searching
searchInput.addEventListener('change', (event) => {
    query = event.target.value;
    updateDisplay();
});

// Initial render
updateDisplay();
