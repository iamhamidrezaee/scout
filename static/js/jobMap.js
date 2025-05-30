// jobMap.js - Career Discovery Platform Job Visualization
class MultiClusterMap {
    constructor(containerId, tooltipId) {
        this.containerId = containerId;
        this.tooltipId = tooltipId;

        // Grab DOM elements
        this.container = document.getElementById(containerId);
        this.tooltip = document.getElementById(tooltipId);

        // Distances for cluster logic
        this.centerThreshold = 120;   // near cluster's center => become new center
        this.detachThreshold = 650;   // far => new cluster

        // Tooltip timing
        this.tooltipDelay = 1000;
        this.hoverTimer = null;

        // Array of clusters, each with its own simulation + group
        this.clusters = [];
        // Give each cluster a numeric ID
        this.clusterCounter = 0;
        this.activeClusterId = null;

        // Zoom configuration
        this.zoomExtent = [0.2, 5]; // Min and max zoom levels
        this.currentZoom = 1;       // Track zoom level

        // Reinforcement mode state
        this.reinforcementMode = false;
        this.selectedReinforceNodes = new Set();
        this.maxReinforceSelections = 3;
        this.currentCenterJobId = null;
        this.setupReinforcementListeners();

        this.favorites = JSON.parse(localStorage.getItem('jobFavorites')) || {};
        this.setupFavoritesContainer();

        // If you have a loading or "message" state, we can display that
        this.showMessage("Search for jobs or enter skills to visualize career paths")
    }

    // ---------------------------------------
    // Reinforcement Mode Setup
    // ---------------------------------------

    setupReinforcementListeners() {
        document.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 'shift' && !this.reinforcementMode) {
                this.enterReinforcementMode();
            }
        });

        document.addEventListener('keyup', (event) => {
            if (event.key.toLowerCase() === 'shift' && this.reinforcementMode) {
                this.exitReinforcementMode();
            }
        });
    }

    enterReinforcementMode() {
        const targetId = this.activeClusterId ?? this.clusters[0]?.id;
        const targetClus = this.getCluster(targetId);
        if (!targetClus) return;
        this.activeClusterId = targetId;
        d3.select('.reinforce-hint').remove();
        this.reinforcementMode = true;
        this.selectedReinforceNodes.clear();
        const centreNode = targetClus.nodes.find(n => n.id === 0);
        this.currentCenterJobId = centreNode?.original_id ?? null;
        let overlaySel = d3.select('.reinforcement-overlay');
        let messageSel;
        if (overlaySel.empty()) {
            overlaySel = d3.select(`#${this.containerId}`)
                .append('div')
                .attr('class', 'reinforcement-overlay');

            messageSel = overlaySel.append('div')
                .attr('class', 'reinforcement-message')
                .style('position', 'absolute')
                .style('top', '20px')
                .style('left', '50%')
                .style('transform', 'translateX(-50%)');
        }
        else {
            messageSel = overlaySel.select('.reinforcement-message');
        }
        messageSel.html('Select <b>1 – 3</b> jobs you want to reinforce');
    }

    exitReinforcementMode() {
        if (!this.reinforcementMode) return;

        this.reinforcementMode = false;

        // Remove overlay
        d3.select(".reinforcement-overlay").remove();

        if (this.selectedReinforceNodes.size === 0) {
            this.showReinforceHint();
        }

        if (this.selectedReinforceNodes.size > 0) {
            this.applyReinforcement();
        }

        // Clear all selections visually
        d3.selectAll(".job-node-group")
            .classed("selected", false)
            .select("circle")
            .attr("stroke", d => d.id === 0 ? "#1C3A5B" : "#8B4513")
            .attr("stroke-width", 2)
            .style("filter", "drop-shadow(0 4px 6px rgba(139, 69, 19, 0.2))");
    }

    async applyReinforcement() {
        if (this.selectedReinforceNodes.size === 0) return;

        try {
            const selectedIds = Array.from(this.selectedReinforceNodes).map(n => n.original_id);
            const centerJobId = this.currentCenterJobId;

            const resp = await fetch("/reinforce", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    center_id: centerJobId,
                    selected_ids: selectedIds
                })
            });

            if (!resp.ok) throw new Error(`Network error: ${resp.statusText}`);

            const data = await resp.json();

            const mainCluster = this.getCluster(this.activeClusterId);
            if (!mainCluster) return;
            
            await new Promise(res => {
                mainCluster.nodeGroup
                    .selectAll('.job-node-group')
                    .filter(d => d.id !== 0 && !this.selectedReinforceNodes.has(d))
                    .transition().duration(600)
                    .style('opacity', 0)
                    .on('end', (_, i, nodes) => {
                        if (i === nodes.length - 1) res();
                    });

                mainCluster.linkGroup
                    .selectAll('.job-link')
                    .filter(l =>
                        !this.selectedReinforceNodes.has(l.source) &&
                        !this.selectedReinforceNodes.has(l.target)
                    )
                    .transition().duration(600)
                    .style('opacity', 0);
            });

            this.showLoading();

            if (!data.center) {
                throw new Error("Invalid response from server");
            }

            // Clear existing clusters
            this.clusters.forEach(cluster => {
                if (cluster.group) cluster.group.remove();
            });
            this.clusters = [];

            // Create new cluster with reinforced data
            this.container.innerHTML = "";

            const containerRect = document.createElement("div");
            containerRect.className = "map-container-rect";
            this.container.appendChild(containerRect);

            const svgRect = containerRect.getBoundingClientRect();
            this.width = svgRect.width;
            this.height = svgRect.height;

            this.svg = d3.select(containerRect)
                .append("svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", `0 0 ${this.width} ${this.height}`)
                .attr("preserveAspectRatio", "xMidYMid meet");

            this.zoomGroup = this.svg.append("g")
                .attr("class", "zoom-group");

            this.initZoom();
            this.createCluster(data, { x: this.width / 2, y: this.height / 2 });

            const keepStroke = d3.selectAll('.job-node-group')
                .filter(d => selectedIds.includes(d.original_id))
                .select('circle')
                .attr('stroke', '#1C3A5B')
                .attr('stroke-width', 3)
                .style('filter', 'drop-shadow(0 0 6px rgba(28,58,91,0.6))');

            keepStroke
                .transition()
                .delay(3000)
                .duration(800)
                .attr('stroke-width', 2)
                .attr('stroke', '#8B4513')
                .style('filter', null);

            this.showReinforceHint(4000);

        } catch (err) {
            console.error("Reinforcement error:", err);
            this.showMessage(`Error: ${err.message}`);
        }
    }

    handleNodeClick(event, d) {
        if (this.reinforcementMode) {
            this.activeClusterId = d.__clusterId;
            const centre = this.getCluster(this.activeClusterId)
                ?.nodes.find(n => n.id === 0);
            this.currentCenterJobId = centre?.original_id ?? null;
            if (d.id === 0) return; // Don't allow selecting the center node

            event.stopPropagation();

            if (this.selectedReinforceNodes.has(d)) {
                // Deselect
                this.selectedReinforceNodes.delete(d);
                d3.select(event.currentTarget.parentNode)
                    .classed("selected", false)
                    .select("circle")
                    .transition()
                    .duration(300)
                    .attr("stroke", "#8B4513")
                    .attr("stroke-width", 2)
                    .style("filter", "drop-shadow(0 4px 6px rgba(139, 69, 19, 0.2))");
            } else if (this.selectedReinforceNodes.size < this.maxReinforceSelections) {
                // Select
                this.selectedReinforceNodes.add(d);
                d3.select(event.currentTarget.parentNode)
                    .classed("selected", true)
                    .select("circle")
                    .transition()
                    .duration(300)
                    .attr("stroke", "#1C3A5B")
                    .attr("stroke-width", 3)
                    .style("filter", "drop-shadow(0 0 8px rgba(28, 58, 91, 0.6))");
            }

            // Update the reinforcement message
            d3.select(".reinforcement-message")
                .html(`Reinforcement Mode: Click up to ${this.maxReinforceSelections} jobs to reinforce`);

        } else {
            // Original behavior - show job details
            this.activeClusterId = d.__clusterId;
            this.showJobDetails(d);
        }
    }

    //--------------------------------------
    //  LOADING & STATUS MESSAGES
    //--------------------------------------
    showMessage(msg) {
        this.container.innerHTML = `<div class="map-message">${msg}</div>`;
    }

    showLoading() {
        this.container.innerHTML = '<div class="loading-map">Finding similar jobs...</div>';
    }

    showDragHint() {
        const hint = d3.select(`#${this.containerId}`)
            .append("div")
            .attr("class", "hint-message")
            .html('Tip: Drag a job near its center to become new center, or far away to spawn another cluster. Use mouse wheel to zoom in/out.');

        setTimeout(() => {
            hint.transition().duration(1000).style("opacity", 0).remove();
        }, 5000);
    }

    showReinforceHint() {
        // only show once
        if (document.querySelector('.reinforce-hint')) return;

        const kwBar = document.getElementById('keyword-search-container');
        if (!kwBar) return;

        // ensure it's a positioning parent
        kwBar.style.position = 'relative';

        // append the hint _inside_ the keyword bar
        d3.select(kwBar)
            .append('div')
            .attr('class', 'reinforce-hint')
            .html('Press&nbsp;<b>Shift</b>&nbsp;to activate reinforcement');
    }

    //--------------------------------------
    //  KEYWORD HIGHLIGHT FUNCTIONALITY
    //--------------------------------------
    keywordHighlightMap(searchInput) {
        const self = this;

        // Parse input to get keywords
        const raw = searchInput.toLowerCase().trim();
        const keywords = raw.split(/[\s,]+/).filter(k => k);

        // First, reset all nodes to their original state
        d3.selectAll(".job-node-group").each(function (d) {
            const node = d3.select(this);

            // Reset the fill color to the color determined by the class method
            node.select("circle").attr("fill", d.originalColor || self.getNodeColor(d));

            // Remove any highlight rings
            node.select(".highlight-ring").remove();

            // Reset stroke to default
            node.select("circle")
                .attr("stroke", d => d.id === 0 ? "#1C3A5B" : "#8B4513")
                .attr("stroke-width", 2);
        });

        if (keywords.length === 0) return;
        
        // Apply a subtle highlight to matching nodes
        d3.selectAll(".job-node-group").each(function (d) {
            const node = d3.select(this);
            const job = d;

            const description = (job.description || "").toLowerCase();
            const title = (job.title || "").toLowerCase();
            const skills = (job.skills || []).join(" ").toLowerCase();
            const hasAll = keywords.every(k => 
                description.includes(k) || title.includes(k) || skills.includes(k)
            );

            if (hasAll) {
                // Apply highlight effect
                node.select("circle")
                    .attr("stroke", "#1C3A5B")
                    .attr("stroke-width", 3)
                    .style("filter", "drop-shadow(0 0 5px rgba(28, 58, 91, 0.5))");

                // Add an animated highlight ring
                const currentRadius = parseFloat(node.select("circle").attr("r"));
                node.append("circle")
                    .attr("class", "highlight-ring")
                    .attr("cx", 0)
                    .attr("cy", 0)
                    .attr("r", currentRadius + 5)
                    .attr("fill", "none")
                    .attr("stroke", "#1C3A5B")
                    .attr("stroke-width", 2)
                    .attr("stroke-opacity", 0.7);
            }
        });
    }

    //--------------------------------------
    //  MAIN SEARCH -> BUILD FIRST CLUSTER
    //--------------------------------------
    async fetchData(query) {
        if (!query || !query.trim()) {
            this.showMessage("Search for jobs or enter skills to visualize career paths");
            return;
        }
        this.showLoading();

        try {
            const resp = await fetch("/map_data?" + new URLSearchParams({ query }).toString());
            if (!resp.ok) throw new Error(`Network error: ${resp.statusText}`);

            const data = await resp.json();
            if (!data.center) {
                this.showMessage("No results found");
                return;
            }

            // Clear old clusters
            this.clusters = [];
            // Clear the container
            this.container.innerHTML = "";

            // Create a <div> to hold the <svg>
            const containerRect = document.createElement("div");
            containerRect.className = "map-container-rect";
            this.container.appendChild(containerRect);

            // Determine size
            this.width = this.container.clientWidth;
            this.height = this.container.clientHeight;

            // Create main SVG
            this.svg = d3.select(containerRect)
                .append("svg")
                .attr("width", "100%")
                .attr("height", "100%")
                .attr("viewBox", `0 0 ${this.width} ${this.height}`)
                .attr("preserveAspectRatio", "xMidYMid meet");

            // Add a group for all clusters that will be transformed during zoom
            this.zoomGroup = this.svg.append("g")
                .attr("class", "zoom-group");

            // Initialize zoom behavior
            this.initZoom();

            // Show a helpful drag hint
            this.showDragHint();

            // Create the initial cluster in center
            this.createCluster(data, { x: this.width / 2, y: this.height / 2 });
            document.getElementById("keyword-search-container").style.display = "flex";
            this.showReinforceHint();
        } catch (err) {
            console.error("fetchData error:", err);
            this.showMessage(`Error: ${err.message}`);
        }
    }

    //--------------------------------------
    //  INITIALIZE ZOOM BEHAVIOR
    //--------------------------------------
    initZoom() {
        // Create zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent(this.zoomExtent)
            .on("zoom", (event) => {
                // Store current zoom level
                this.currentZoom = event.transform.k;

                // Apply transformation to the zoom group
                this.zoomGroup.attr("transform", event.transform);

                // Update tooltip position calculation for zoomed view
                this.updateTooltipPositionForZoom();
            });

        // Apply zoom to SVG
        this.svg.call(this.zoom);

        // Add zoom controls
        this.addZoomControls();
    }

    addZoomControls() {
        // Create zoom controls div
        const controlsDiv = d3.select(`#${this.containerId}`)
            .append("div")
            .attr("class", "zoom-controls");

        // Zoom in button
        controlsDiv.append("button")
            .attr("class", "zoom-button")
            .html("+")
            .on("click", () => this.zoomBy(1.2));

        // Zoom out button
        controlsDiv.append("button")
            .attr("class", "zoom-button")
            .html("−")
            .on("click", () => this.zoomBy(0.8));

        // Reset zoom button
        controlsDiv.append("button")
            .attr("class", "zoom-button")
            .html("⟲")
            .on("click", () => this.resetZoom());
    }

    zoomBy(factor) {
        const newScale = Math.max(
            this.zoomExtent[0],
            Math.min(this.zoomExtent[1], this.currentZoom * factor)
        );

        this.svg.transition()
            .duration(300)
            .call(
                this.zoom.transform,
                d3.zoomIdentity.scale(newScale)
            );
    }

    resetZoom() {
        this.svg.transition()
            .duration(500)
            .call(
                this.zoom.transform,
                d3.zoomIdentity
            );
    }

    //--------------------------------------
    //  CREATE A NEW CLUSTER
    //--------------------------------------
    createCluster(mapData, position) {
        const cid = ++this.clusterCounter;

        // Build the data arrays for nodes & links
        const centerNode = { ...mapData.center, __clusterId: cid, id: 0 };  // center => id=0
        const relatedNodes = mapData.related.map((r, i) => ({
            ...r, __clusterId: cid, id: i + 1
        }));
        const nodes = [centerNode, ...relatedNodes];
        const links = relatedNodes.map(n => ({
            source: 0,    // center is node id=0
            target: n.id, // the related node
            value: n.score
        }));

        // Create a group for this entire cluster
        const clusterGroup = this.zoomGroup.append("g")
            .attr("class", `cluster-group c${cid}`);

        clusterGroup
            .style('opacity', 0)
            .transition().duration(600)
            .style('opacity', 1);

        // Make subgroups for links & nodes
        const linkGroup = clusterGroup.append("g").attr("class", "links-container");
        const nodeGroup = clusterGroup.append("g").attr("class", "nodes-container");

        // Link selection
        const linkSel = linkGroup.selectAll("line")
            .data(links)
            .enter()
            .append("line")
            .attr("class", "job-link")
            .attr("stroke", "#A0522D")
            .attr("stroke-opacity", 0.4)
            .attr("stroke-width", d => Math.max(1, d.value * 4));

        // Node selection
        const nodeSel = nodeGroup.selectAll("g.job-node-group")
            .data(nodes)
            .enter()
            .append("g")
            .attr("class", "job-node-group")
            .call(d3.drag()
                .on("start", (event, d) => this.dragstarted(event, d, cid))
                .on("drag", (event, d) => this.dragged(event, d, cid))
                .on("end", (event, d) => this.dragended(event, d, cid))
            );

        // Circles with transparent fill and colored borders
        nodeSel.append("circle")
            .attr("class", "job-node")
            .attr("r", 0)
            .attr("fill", "transparent")
            .attr("stroke", d => d.id === 0 ? "#1C3A5B" : "#8B4513")
            .attr("stroke-width", 2)
            // Store original color for later reference
            .each(function(d) {
                d.originalColor = "transparent";
            })
            // Delayed tooltip
            .on("mouseover", (event, d) => this.handleNodeMouseOver(event, d))
            .on("mouseout", () => this.handleNodeMouseOut())
            .on("click", (event, d) => this.handleNodeClick(event, d));

        // Titles
        this.addNodeTitles(nodeSel);

        nodeSel.style('opacity', 0)
            .transition()
            .delay((d, i) => i * 20)
            .duration(500)
            .style('opacity', 1);

        nodeSel.select('circle')
            .transition()
            .delay((d, i) => i * 25)
            .duration(500)
            .attr('r', d => this.getNodeRadius(d));

        linkSel.attr('stroke-opacity', 0)
            .transition()
            .delay((d, i) => i * 20)
            .duration(500)
            .attr('stroke-opacity', 0.4);

        // Force simulation local to this cluster
        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links)
                .id(d => d.id)
                .distance(d => 150 * (1 - d.value) + 150)
                .strength(0.2)
            )
            .force("charge", d3.forceManyBody().strength(-200))
            .force("collision", d3.forceCollide()
                .radius(d => this.getNodeRadius(d) + 30)
            )
            .force("x", d3.forceX(position.x).strength(0.05))
            .force("y", d3.forceY(position.y).strength(0.05));

        simulation.on("tick", () => {
            // Apply inter-cluster node collision force before updating positions
            if (this.clusters.length > 0) {
                this.applyInterClusterNodeCollision();
            }

            linkSel
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            nodeSel
                .attr("transform", d => `translate(${d.x},${d.y})`);

            // Update cluster bounds after each tick
            this.updateClusterBounds(cid);

            // Apply inter-cluster separation force
            if (this.clusters.length > 1) {
                this.applyClusterSeparationForce();
            }
        });

        // Save cluster info
        this.clusters.push({
            id: cid,
            group: clusterGroup,
            linkGroup,
            nodeGroup,
            nodes,
            links,
            simulation,
            position: position,
            bounds: {
                minX: position.x - 200,
                maxX: position.x + 200,
                minY: position.y - 200,
                maxY: position.y + 200,
                centerX: position.x,
                centerY: position.y,
                radius: 200
            }
        });

        // Initial bounds calculation
        this.updateClusterBounds(cid);

        // Re-establish the inter-cluster forces
        this.setupGlobalForces();
        if (document.getElementById('keyword-search-bar').value.trim()) {
            this.keywordHighlightMap(document.getElementById('keyword-search-bar').value);
        }
        this.activeClusterId = cid;
        return this.clusters[this.clusters.length - 1];
    }

    //--------------------------------------
    //  GLOBAL FORCES FOR ALL CLUSTERS
    //--------------------------------------
    setupGlobalForces() {
        if (this.clusters.length <= 1) return;

        this.clusters.forEach(cluster => {
            if (cluster.simulation) {
                cluster.simulation.alpha(0.3).restart();
            }
        });
    }

    //--------------------------------------
    //  INTER-CLUSTER NODE COLLISION
    //--------------------------------------
    applyInterClusterNodeCollision() {
        if (this.clusters.length <= 1) return;

        const INTER_CLUSTER_PADDING = 10;

        for (let i = 0; i < this.clusters.length; i++) {
            const clusterA = this.clusters[i];

            for (let j = i + 1; j < this.clusters.length; j++) {
                const clusterB = this.clusters[j];

                for (let nodeA of clusterA.nodes) {
                    for (let nodeB of clusterB.nodes) {
                        if (nodeA.fx !== null || nodeA.fy !== null ||
                            nodeB.fx !== null || nodeB.fy !== null) continue;

                        const dx = nodeB.x - nodeA.x;
                        const dy = nodeB.y - nodeA.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        const radiusA = this.getNodeRadius(nodeA);
                        const radiusB = this.getNodeRadius(nodeB);
                        const minDistance = radiusA + radiusB + INTER_CLUSTER_PADDING;

                        if (distance < minDistance && distance > 0) {
                            const force = (minDistance - distance) / distance;
                            const unitX = dx / distance;
                            const unitY = dy / distance;

                            nodeA.x -= unitX * force * 2;
                            nodeA.y -= unitY * force * 2;
                            nodeB.x += unitX * force * 2;
                            nodeB.y += unitY * force * 2;

                            if (nodeA.vx !== undefined && nodeA.vy !== undefined) {
                                nodeA.vx -= unitX * force * 0.5;
                                nodeA.vy -= unitY * force * 0.5;
                            }

                            if (nodeB.vx !== undefined && nodeB.vy !== undefined) {
                                nodeB.vx += unitX * force * 0.5;
                                nodeB.vy += unitY * force * 0.5;
                            }
                        }
                    }
                }
            }
        }
    }

    //--------------------------------------
    //  CLUSTER SEPARATION LOGIC
    //--------------------------------------
    updateClusterBounds(clusterId) {
        const cluster = this.getCluster(clusterId);
        if (!cluster || !cluster.nodes.length) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        cluster.nodes.forEach(node => {
            if (!node.x || !node.y) return;

            const radius = this.getNodeRadius(node);
            minX = Math.min(minX, node.x - radius);
            minY = Math.min(minY, node.y - radius);
            maxX = Math.max(maxX, node.x + radius);
            maxY = Math.max(maxY, node.y + radius);
        });

        if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
            cluster.bounds = {
                minX, minY, maxX, maxY,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                radius: Math.max(maxX - minX, maxY - minY) / 2 + 50
            };
        }
    }

    applyClusterSeparationForce() {
        const MIN_SEPARATION = 100;

        for (let i = 0; i < this.clusters.length; i++) {
            const clusterA = this.clusters[i];

            for (let j = i + 1; j < this.clusters.length; j++) {
                const clusterB = this.clusters[j];

                const dx = clusterB.bounds.centerX - clusterA.bounds.centerX;
                const dy = clusterB.bounds.centerY - clusterA.bounds.centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                const minDistance = clusterA.bounds.radius + clusterB.bounds.radius + MIN_SEPARATION;

                if (distance < minDistance && distance > 0) {
                    const unitX = dx / distance;
                    const unitY = dy / distance;
                    const strength = (minDistance - distance) / minDistance * 0.2;

                    clusterA.nodes.forEach(node => {
                        if (node.fx === null) {
                            node.vx -= unitX * strength * 15;
                            node.vy -= unitY * strength * 15;
                        }
                    });

                    clusterB.nodes.forEach(node => {
                        if (node.fx === null) {
                            node.vx += unitX * strength * 15;
                            node.vy += unitY * strength * 15;
                        }
                    });

                    if (!this.isClusterBeingDragged(clusterA) && !this.isClusterBeingDragged(clusterB)) {
                        const moveAmount = (minDistance - distance) / 2 * 1.5;

                        this.moveCluster(clusterA, -unitX * moveAmount, -unitY * moveAmount);
                        this.moveCluster(clusterB, unitX * moveAmount, unitY * moveAmount);
                    }
                }
            }
        }
    }

    isClusterBeingDragged(cluster) {
        return cluster.nodes.some(node => node.fx !== null || node.fy !== null);
    }

    moveCluster(cluster, dx, dy) {
        cluster.nodes.forEach(node => {
            node.x += dx;
            node.y += dy;
        });

        cluster.nodeGroup.selectAll(".job-node-group")
            .attr("transform", d => `translate(${d.x},${d.y})`);

        cluster.linkGroup.selectAll(".job-link")
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        this.updateClusterBounds(cluster.id);
    }

    //--------------------------------------
    //  DRAG LOGIC
    //--------------------------------------
    dragstarted(event, d, clusterId) {
        if (event.sourceEvent) event.sourceEvent.stopPropagation();

        const cluster = this.getCluster(clusterId);
        if (!event.active) cluster.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d, clusterId) {
        d.fx = event.x;
        d.fy = event.y;
    }

    async dragended(event, d, clusterId) {
        const cluster = this.getCluster(clusterId);
        d.fx = null;
        d.fy = null;
        cluster.simulation.alpha(0.3).restart();

        // If center node => ignore
        if (d.id === 0) return;

        // Distance from cluster center
        const centerNode = cluster.nodes.find(n => n.id === 0);
        if (!centerNode) return;
        const dist = Math.hypot(d.x - centerNode.x, d.y - centerNode.y);

        if (dist < this.centerThreshold) {
            // => become new center
            this.animateNodeToCenter(d, cluster);
        } else if (dist > this.detachThreshold) {
            // => new cluster
            this.detachNode(d, cluster);
        }
    }

    getCluster(cid) {
        return this.clusters.find(c => c.id === cid);
    }

    //--------------------------------------
    //  MAKE A NODE THE NEW CENTER - WITH SEAMLESS TRANSITION
    //--------------------------------------
    animateNodeToCenter(nodeDatum, cluster) {
        const exactNodePos = { x: nodeDatum.x, y: nodeDatum.y };

        cluster.simulation.stop();

        const chosenNodeSel = cluster.nodeGroup
            .selectAll(".job-node-group")
            .filter(d => d === nodeDatum);

        const transitionNodeGroup = this.zoomGroup.append("g")
            .attr("class", "transition-node-group")
            .attr("transform", `translate(${exactNodePos.x},${exactNodePos.y})`);

        const transitionCircle = transitionNodeGroup.append("circle")
            .attr("class", "job-node")
            .attr("r", this.getNodeRadius(nodeDatum))
            .attr("fill", "transparent")
            .attr("stroke", "#1C3A5B")
            .attr("stroke-width", 2);

        const transitionText = transitionNodeGroup.append("text")
            .attr("class", "job-title")
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .style("font-size", "11px")
            .style("fill", "#8B4513")
            .text(this.truncateTitle(nodeDatum.title, 25));

        cluster.nodeGroup.selectAll(".job-node-group")
            .filter(d => d !== nodeDatum)
            .transition()
            .duration(400)
            .style("opacity", 0)
            .remove();

        cluster.linkGroup.selectAll(".job-link")
            .transition()
            .duration(400)
            .style("opacity", 0)
            .remove();

        transitionCircle.transition()
            .duration(600)
            .attr("r", 70)
            .attr("stroke", "#1C3A5B")
            .attr("stroke-width", 3);

        transitionText.transition()
            .duration(600)
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .style("fill", "#8B4513");

        chosenNodeSel.transition()
            .duration(300)
            .style("opacity", 0)
            .remove();

        setTimeout(() => {
            if (cluster.group) {
                cluster.group.remove();
            }
            this.clusters = this.clusters.filter(c => c !== cluster);

            const fetchAndCreateNewCluster = async () => {
                const origId = nodeDatum.original_id;
                if (origId !== undefined) {
                    const newData = await this.fetchJobAsQuery(origId);
                    if (newData && newData.center) {
                        this.createInPlaceCluster(newData, exactNodePos, transitionNodeGroup);
                    }
                }
            };

            fetchAndCreateNewCluster();
        }, 500);
    }

    //--------------------------------------
    //  CREATE IN-PLACE CLUSTER
    //--------------------------------------
    createInPlaceCluster(mapData, position, transitionNode) {
        const cid = ++this.clusterCounter;

        const centerNode = { ...mapData.center, __clusterId: cid, id: 0, x: position.x, y: position.y, fx: position.x, fy: position.y };
        const relatedNodes = mapData.related.map((r, i) => ({
            ...r, __clusterId: cid, id: i + 1,
            x: position.x, y: position.y
        }));

        const nodes = [centerNode, ...relatedNodes];
        const links = relatedNodes.map(n => ({
            source: 0,
            target: n.id,
            value: n.score
        }));

        const clusterGroup = this.zoomGroup.append("g")
            .attr("class", `cluster-group c${cid}`);

        const linkGroup = clusterGroup.append("g").attr("class", "links-container");
        const nodeGroup = clusterGroup.append("g").attr("class", "nodes-container");

        const linkSel = linkGroup.selectAll("line")
            .data(links)
            .enter()
            .append("line")
            .attr("class", "job-link")
            .attr("stroke", "#A0522D")
            .attr("stroke-opacity", 0)
            .attr("stroke-width", d => Math.max(1, d.value * 4))
            .attr("x1", position.x)
            .attr("y1", position.y)
            .attr("x2", position.x)
            .attr("y2", position.y);

        const nodeSel = nodeGroup.selectAll("g.job-node-group")
            .data(nodes)
            .enter()
            .append("g")
            .attr("class", "job-node-group")
            .attr("transform", d => `translate(${position.x},${position.y})`)
            .style("opacity", d => d.id === 0 ? 1 : 0)
            .call(d3.drag()
                .on("start", (event, d) => this.dragstarted(event, d, cid))
                .on("drag", (event, d) => this.dragged(event, d, cid))
                .on("end", (event, d) => this.dragended(event, d, cid))
            );

        nodeSel.append("circle")
            .attr("class", "job-node")
            .attr("r", d => this.getNodeRadius(d))
            .attr("fill", "transparent")
            .attr("stroke", d => d.id === 0 ? "#1C3A5B" : "#8B4513")
            .attr("stroke-width", 2)
            .on("mouseover", (event, d) => this.handleNodeMouseOver(event, d))
            .on("mouseout", () => this.handleNodeMouseOut())
            .on("click", (event, d) => this.handleNodeClick(event, d));

        this.addNodeTitles(nodeSel);

        nodeSel.filter(d => d.id === 0).style("opacity", 0);

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links)
                .id(d => d.id)
                .distance(d => 150 * (1 - d.value) + 150)
                .strength(0.2)
            )
            .force("charge", d3.forceManyBody().strength(-200))
            .force("collision", d3.forceCollide()
                .radius(d => this.getNodeRadius(d) + 30)
            )
            .force("x", d3.forceX(position.x).strength(0.05))
            .force("y", d3.forceY(position.y).strength(0.05))
            .alpha(0);

        centerNode.fx = position.x;
        centerNode.fy = position.y;

        simulation.on("tick", () => {
            if (this.clusters.length > 0) {
                this.applyInterClusterNodeCollision();
            }

            linkSel
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            nodeSel
                .attr("transform", d => `translate(${d.x},${d.y})`);

            this.updateClusterBounds(cid);

            if (this.clusters.length > 1) {
                this.applyClusterSeparationForce();
            }
        });

        this.clusters.push({
            id: cid,
            group: clusterGroup,
            linkGroup,
            nodeGroup,
            nodes,
            links,
            simulation,
            position,
            bounds: {
                minX: position.x - 200,
                maxX: position.x + 200,
                minY: position.y - 200,
                maxY: position.y + 200,
                centerX: position.x,
                centerY: position.y,
                radius: 200
            }
        });

        // Start the seamless transition
        setTimeout(() => {
            transitionNode.transition()
                .duration(300)
                .style("opacity", 0)
                .remove();

            nodeSel.filter(d => d.id === 0)
                .transition()
                .duration(300)
                .style("opacity", 1);

            setTimeout(() => {
                setTimeout(() => {
                    centerNode.fx = null;
                    centerNode.fy = null;
                }, 1000);

                linkSel.transition()
                    .delay((d, i) => i * 25)
                    .duration(500)
                    .attr("stroke-opacity", 0.4);

                nodeSel.filter(d => d.id !== 0)
                    .transition()
                    .delay((d, i) => i * 30)
                    .duration(600)
                    .style("opacity", 1);

                simulation.alpha(0.3).restart();

                setTimeout(() => {
                    simulation.alpha(0.8).restart();
                }, 500);
            }, 300);
        }, 300);

        this.activeClusterId = cid;
        this.updateClusterBounds(cid);
        return this.clusters[this.clusters.length - 1];
    }

    //--------------------------------------
    //  DETACH => NEW CLUSTER
    //--------------------------------------
    detachNode(nodeDatum, cluster) {
        const exactNodePos = { x: nodeDatum.x, y: nodeDatum.y };

        const transitionNodeGroup = this.zoomGroup.append("g")
            .attr("class", "transition-node-group")
            .attr("transform", `translate(${exactNodePos.x},${exactNodePos.y})`);

        const transitionCircle = transitionNodeGroup.append("circle")
            .attr("class", "job-node")
            .attr("r", this.getNodeRadius(nodeDatum))
            .attr("fill", "transparent")
            .attr("stroke", "#8B4513")
            .attr("stroke-width", 2);

        const transitionText = transitionNodeGroup.append("text")
            .attr("class", "job-title")
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .style("font-size", "11px")
            .style("fill", "#8B4513")
            .text(this.truncateTitle(nodeDatum.title, 25));

        transitionCircle.transition()
            .duration(300)
            .attr("r", this.getNodeRadius(nodeDatum) * 1.2)
            .attr("stroke", "#1C3A5B")
            .attr("stroke-width", 3);

        const connectedLinks = cluster.linkGroup
            .selectAll(".job-link")
            .filter(l => l.source === nodeDatum || l.target === nodeDatum);

        connectedLinks
            .transition()
            .duration(400)
            .style("opacity", 0)
            .remove();

        const nodeSel = cluster.nodeGroup
            .selectAll(".job-node-group")
            .filter(d => d === nodeDatum);

        nodeSel.transition()
            .duration(400)
            .style("opacity", 0)
            .remove();

        cluster.links = cluster.links.filter(l =>
            l.source !== nodeDatum && l.target !== nodeDatum
        );
        cluster.nodes = cluster.nodes.filter(n => n !== nodeDatum);

        cluster.simulation.alpha(0.3).restart();

        if (nodeDatum.original_id === undefined) {
            setTimeout(() => {
                transitionNodeGroup.transition()
                    .duration(400)
                    .style("opacity", 0)
                    .remove();
            }, 800);
            return;
        }

        setTimeout(async () => {
            try {
                const data = await this.fetchJobAsQuery(nodeDatum.original_id);
                if (!data || !data.center) {
                    transitionNodeGroup.transition()
                        .duration(400)
                        .style("opacity", 0)
                        .remove();
                    return;
                }

                this.createInPlaceCluster(data, exactNodePos, transitionNodeGroup);

            } catch (err) {
                console.error("Error fetching data for detached node:", err);
                transitionNodeGroup.transition()
                    .duration(400)
                    .style("opacity", 0)
                    .remove();
            }
        }, 500);
    }

    //--------------------------------------
    //  FETCH JOB AS QUERY
    //--------------------------------------
    async fetchJobAsQuery(originalId) {
        try {
            const resp = await fetch("/job_as_query?" + new URLSearchParams({ job_id: originalId }).toString());
            if (!resp.ok) throw new Error(`Network response not ok: ${resp.statusText}`);
            const data = await resp.json();
            if (!data.center) return null;
            return data;
        } catch (err) {
            console.error("fetchJobAsQuery error:", err);
            return null;
        }
    }

    //--------------------------------------
    //  NODES: RADIUS, COLOR, TITLE, etc.
    //--------------------------------------
    getNodeRadius(d) {
        if (d.id === 0) return 100; // Center node

        const baseSize = 15;
        const scoreContribution = d.score * 15;

        // Use salary for sizing
        let salaryContribution = 0;
        if (d.salary_min && d.salary_max) {
            const avgSalary = (d.salary_min + d.salary_max) / 2;
            salaryContribution = Math.log(avgSalary / 1000 + 1) * 8;
            salaryContribution = Math.min(salaryContribution, 45);
        }

        return baseSize + scoreContribution + salaryContribution;
    }

    getNodeColor(d) {
        // All nodes have transparent fill
        return "transparent";
    }

    addNodeTitles(selection) {
        selection.append("text")
            .attr("class", "job-title")
            .attr("text-anchor", "middle")
            .attr("dy", ".35em")
            .style("font-size", d => d.id === 0 ? "14px" : "11px")
            .style("fill", "#8B4513")
            .style("font-weight", d => d.id === 0 ? "bold" : "normal")
            .text(d => this.truncateTitle(d.title, 25));
    }

    truncateTitle(title, maxLen) {
        if (!title) return "";
        return title.length > maxLen ? title.slice(0, maxLen) + "..." : title;
    }

    //--------------------------------------
    //  TOOLTIP (DELAY)
    //--------------------------------------
    handleNodeMouseOver(event, d) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = setTimeout(() => {
            const pageX = event.pageX, pageY = event.pageY;
            const tipW = 320;
            let leftPos = pageX + 15;
            if (leftPos + tipW > window.innerWidth) {
                leftPos = pageX - tipW - 15;
            }
            this.tooltip.style.left = leftPos + "px";
            this.tooltip.style.top = (pageY - 100) + "px";

            // Fill contents
            this.tooltip.querySelector(".tooltip-title").textContent = d.title;
            this.tooltip.querySelector(".tooltip-description").textContent = d.description || "No description available";
            
            const detailsEl = this.tooltip.querySelector(".tooltip-details");
            const salaryRange = d.salary_min && d.salary_max ? 
                `$${d.salary_min.toLocaleString()} - $${d.salary_max.toLocaleString()}` : "Salary not specified";
            const experience = d.experience_level || "Not specified";
            const skills = d.skills ? d.skills.slice(0, 5).join(", ") : "No skills listed";
            
            detailsEl.innerHTML = `
                <div class="tooltip-salary">${salaryRange}</div>
                <div class="tooltip-experience">Experience: ${experience}</div>
                <div class="tooltip-skills">Skills: ${skills}</div>
            `;

            this.tooltip.style.display = "block";
            this.tooltip.dataset.currentNode = d.id;

            this.tooltip.addEventListener('mouseenter', this.handleTooltipMouseEnter.bind(this));
            this.tooltip.addEventListener('mouseleave', this.handleTooltipMouseLeave.bind(this));
        }, this.tooltipDelay);
    }

    handleNodeMouseOut() {
        clearTimeout(this.hoverTimer);

        this.hoverTimer = setTimeout(() => {
            if (!this.isMouseOverTooltip) {
                this.tooltip.style.display = "none";
            }
        }, 100);
    }

    handleTooltipMouseEnter() {
        this.isMouseOverTooltip = true;
        clearTimeout(this.hoverTimer);
    }

    handleTooltipMouseLeave() {
        this.isMouseOverTooltip = false;
        this.tooltip.style.display = "none";

        this.tooltip.removeEventListener('mouseenter', this.handleTooltipMouseEnter);
        this.tooltip.removeEventListener('mouseleave', this.handleTooltipMouseLeave);
    }

    //------------------
    // JOB DETAILS POPUP
    //-------------------
    showJobDetails(d) {
        this.createJobPopup(d);
    }

    createJobPopup(jobData) {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'job-popup-container';

        // Create popup content
        const popupContent = document.createElement('div');
        popupContent.className = 'job-popup-content';

        // Header with close button
        const header = document.createElement('div');
        header.className = 'job-popup-header';

        const titleEl = document.createElement('h3');
        titleEl.className = 'job-popup-title';
        titleEl.textContent = jobData.title || "Job Details";

        const closeBtn = document.createElement('button');
        closeBtn.className = 'job-popup-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => {
            document.body.removeChild(overlay);
        };

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // Body with job details
        const body = document.createElement('div');
        body.className = 'job-popup-body';

        const salaryRange = jobData.salary_min && jobData.salary_max ? 
            `$${jobData.salary_min.toLocaleString()} - $${jobData.salary_max.toLocaleString()}` : "Salary not specified";

        body.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h4 style="color: #1C3A5B; margin-bottom: 10px;">Job Description</h4>
                <p style="color: #8B4513; line-height: 1.6;">${jobData.description || "No description available"}</p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="color: #1C3A5B; margin-bottom: 10px;">Compensation & Experience</h4>
                <p style="color: #8B4513;"><strong>Salary Range:</strong> ${salaryRange}</p>
                <p style="color: #8B4513;"><strong>Experience Level:</strong> ${jobData.experience_level || "Not specified"}</p>
            </div>
            
            ${jobData.skills && jobData.skills.length > 0 ? `
            <div style="margin-bottom: 20px;">
                <h4 style="color: #1C3A5B; margin-bottom: 10px;">Required Skills</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${jobData.skills.map(skill => 
                        `<span style="background-color: rgba(139, 69, 19, 0.1); color: #8B4513; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${skill}</span>`
                    ).join('')}
                </div>
            </div>
            ` : ''}
        `;

        // Footer with favorite button
        const footer = document.createElement('div');
        footer.className = 'job-popup-footer';

        // Favorite button
        const favoriteButton = document.createElement('button');
        favoriteButton.className = 'favorite-button';
        favoriteButton.setAttribute('data-job-id', jobData.original_id);

        const isFavorited = !!this.favorites[jobData.original_id];
        if (isFavorited) {
            favoriteButton.classList.add('favorited');
            favoriteButton.innerHTML = '<i class="fas fa-heart"></i> Favorited';
        } else {
            favoriteButton.innerHTML = '<i class="far fa-heart"></i> Favorite';
        }

        favoriteButton.onclick = () => {
            this.toggleFavorite(jobData);
        };

        const favoriteWrapper = document.createElement('div');
        favoriteWrapper.className = 'job-popup-favorite';
        favoriteWrapper.appendChild(favoriteButton);

        footer.appendChild(favoriteWrapper);

        // Put it all together
        popupContent.appendChild(header);
        popupContent.appendChild(body);
        popupContent.appendChild(footer);
        overlay.appendChild(popupContent);

        document.body.appendChild(overlay);
    }

    //--------------------------------------
    //  FAVORITES FUNCTIONALITY
    //--------------------------------------
    setupFavoritesContainer() {
        const container = document.getElementById('favorites-container');
        if (container) {
            const closeBtn = container.querySelector('.favorites-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    container.classList.add('hidden');
                });
            }
        }

        this.renderFavorites();
    }

    toggleFavoritesContainer() {
        const container = document.getElementById('favorites-container');
        if (container) {
            container.classList.toggle('hidden');
        }
    }

    toggleFavorite(job) {
        const jobId = job.original_id;

        if (this.favorites[jobId]) {
            delete this.favorites[jobId];
        } else {
            this.favorites[jobId] = {
                id: jobId,
                title: job.title || "Unknown Title",
                description: job.description || "",
                salary_min: job.salary_min || 0,
                salary_max: job.salary_max || 0,
                experience_level: job.experience_level || "Not specified",
                skills: job.skills || [],
                timestamp: Date.now()
            };
        }

        localStorage.setItem('jobFavorites', JSON.stringify(this.favorites));
        this.renderFavorites();
        this.updateFavoriteButton(job);
    }

    updateFavoriteButton(job) {
        const jobId = job.original_id;
        const isFavorited = !!this.favorites[jobId];

        const favoriteBtn = document.querySelector(`.favorite-button[data-job-id="${jobId}"]`);
        if (favoriteBtn) {
            if (isFavorited) {
                favoriteBtn.classList.add('favorited');
                favoriteBtn.innerHTML = '<i class="fas fa-heart"></i> Favorited';
            } else {
                favoriteBtn.classList.remove('favorited');
                favoriteBtn.innerHTML = '<i class="far fa-heart"></i> Favorite';
            }
        }
    }

    renderFavorites() {
        const favoritesListEl = document.getElementById('favorites-list');
        if (!favoritesListEl) return;

        favoritesListEl.innerHTML = '';

        const favoritesArray = Object.values(this.favorites);
        favoritesArray.sort((a, b) => b.timestamp - a.timestamp);

        if (favoritesArray.length === 0) {
            favoritesListEl.innerHTML = '<div class="no-favorites-message">No favorites yet. Click the heart icon in job popups to add them.</div>';
            return;
        }

        favoritesArray.forEach(job => {
            const favoriteItem = document.createElement('div');
            favoriteItem.className = 'favorite-item';

            const salaryRange = job.salary_min && job.salary_max ? 
                `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}` : "Salary not specified";

            favoriteItem.innerHTML = `
                <div class="favorite-item-title">${job.title}</div>
                <div class="favorite-item-meta">
                    <div class="favorite-item-salary">${salaryRange}</div>
                    <div class="favorite-item-experience">${job.experience_level}</div>
                </div>
                <div class="favorite-item-actions">
                    <span class="favorite-item-link">Skills: ${job.skills.slice(0, 3).join(", ")}</span>
                    <button class="favorite-item-remove" data-job-id="${job.id}">Remove</button>
                </div>
            `;

            favoritesListEl.appendChild(favoriteItem);

            const removeBtn = favoriteItem.querySelector('.favorite-item-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    delete this.favorites[job.id];
                    localStorage.setItem('jobFavorites', JSON.stringify(this.favorites));
                    this.renderFavorites();
                });
            }
        });
    }
}

//--------------------------------------
//  INIT ON DOMContentLoaded
//--------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Instantiate
    const multiMap = new MultiClusterMap('map-container', 'job-tooltip');

    // Basic input handling
    const searchInput = document.getElementById('map-search-input');

    function debounce(fn, wait) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    const debouncedSearch = debounce(() => {
        const query = searchInput.value.trim();
        if (query) multiMap.fetchData(query);
    }, 500);

    searchInput.addEventListener('input', debouncedSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) multiMap.fetchData(query);
        }
    });

    window.sendFocus = function () {
        searchInput.focus();
    };

    searchInput.focus();
});