import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');

projectsTitle.textContent = `My Projects (${projects.length})`;

let query = '';
let searchInput = document.querySelector('.searchBar');

let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
let colors = d3.scaleOrdinal(d3.schemeTableau10);

// Render the pie chart using the projects provided
function renderPieChart(projectsGiven) {
    // Group projects by year
    let rolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year
    );

    // Convert grouped data into objects
    let data = rolledData.map(([year, count]) => {
        return { value: count, label: year };
    });

    // Generate pie slices
    let sliceGenerator = d3.pie().value((d) => d.value);
    let arcData = sliceGenerator(data);
    let arcs = arcData.map((d) => arcGenerator(d));

    // Clear the previous pie chart
    let svg = d3.select('#projects-pie-plot');
    svg.selectAll('path').remove();

    // Clear the previous legend
    let legend = d3.select('.legend');
    legend.selectAll('li').remove();

    // Draw the updated pie chart
    arcs.forEach((arc, idx) => {
        svg
            .append('path')
            .attr('d', arc)
            .attr('fill', colors(idx));
    });

    // Draw the updated legend
    data.forEach((d, idx) => {
        legend
            .append('li')
            .attr('style', `--color: ${colors(idx)}`)
            .attr('class', 'legend-item')
            .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);
    });
}

// Render everything when the page first loads
renderProjects(projects, projectsContainer, 'h2');
renderPieChart(projects);

// Update both the projects and pie chart when searching
searchInput.addEventListener('change', (event) => {
    query = event.target.value;

    let filteredProjects = projects.filter((project) => {
        let values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });

    renderProjects(filteredProjects, projectsContainer, 'h2');
    renderPieChart(filteredProjects);
});