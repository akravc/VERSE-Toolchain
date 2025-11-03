// Based on code found at https://gist.github.com/robschmuecker/7880033

/*Copyright (c) 2013-2016, Rob Schmuecker
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* The name Rob Schmuecker may not be used to endorse or promote products
  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL MICHAEL BOSTOCK BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.*/

/**
 * Enhanced Tree Visualization Component
 * Provides a robust, user-friendly tree display with improved error handling
 * and better user experience features.
 */
function renderTree(treeData) {
    // Validate input data
    if (!treeData || typeof treeData !== 'object') {
        console.error('Invalid tree data provided to renderTree');
        return;
    }

    // Configuration object for better maintainability
    const config = {
        duration: 750,
        panSpeed: 200,
        panBoundary: 20,
        nodeSpacing: 25,
        levelWidth: 200, // Fixed width for each level instead of variable width
        zoomScaleExtent: [0.1, 3],
        tooltipWidth: 300,
        tooltipFontSize: '12px',
        notificationDuration: 2000,
        ghostCircleRadius: 30,
        nodeCircleRadius: 4.5,
        tooltipOffset: { x: 125, y: 15 },
        maxTextWidth: 150 // Maximum width for text labels before wrapping
    };

    // State management
    const state = {
        totalNodes: 0,
        selectedNode: null,
        draggingNode: null,
        dragStarted: false,
        panTimer: null,
        nodeIdCounter: 0,
        root: null,
        viewerWidth: 0,
        viewerHeight: 0,
        tooltip: null,
        notification: null,
        tooltipDisabled: false,
        tooltipDisableTimer: null
    };

    // DOM elements cache
    const elements = {
        container: null,
        svg: null,
        svgGroup: null,
        zoomListener: null
    };

    // Initialize the tree visualization
    function initialize() {
        try {
            // Clear existing tree
            clearExistingTree();
            
            // Setup dimensions
            setupDimensions();
            
            // Calculate tree metrics
            calculateTreeMetrics();
            
            // Create SVG elements
            createSVGElements();
            
            // Setup tree layout
            setupTreeLayout();
            
            // Initialize root node
            initializeRoot();
            
            // Setup event listeners
            setupEventListeners();
            
            // Render initial tree
            renderInitialTree();
            
        } catch (error) {
            console.error('Error initializing tree:', error);
            showErrorNotification('Failed to initialize tree visualization');
        }
    }

    function clearExistingTree() {
        const container = d3.select("#tree-container");
        if (!container.empty()) {
            container.selectAll("*").remove();
        }
    }

    function setupDimensions() {
        state.viewerWidth = $(document).width() || window.innerWidth || 800;
        state.viewerHeight = $(document).height() || window.innerHeight || 600;
    }

    function calculateTreeMetrics() {
        if (!treeData.children) return;
        
        visit(treeData, function(d) {
            state.totalNodes++;
        }, function(d) {
            return d.children && d.children.length > 0 ? d.children : null;
        });
    }

    function createSVGElements() {
        // Create base SVG
        elements.svg = d3.select("#tree-container")
            .append("svg")
            .attr("width", state.viewerWidth)
            .attr("height", state.viewerHeight)
            .attr("class", "tree-overlay")
            .style("overflow", "hidden");

        // Create zoom listener
        elements.zoomListener = d3.behavior.zoom()
            .scaleExtent(config.zoomScaleExtent)
            .on("zoom", handleZoom);

        // Apply zoom listener to SVG
        elements.svg.call(elements.zoomListener);

        // Create main group
        elements.svgGroup = elements.svg.append("g");

        // Create tooltip
        state.tooltip = d3.select("body")
            .append("div")
            .attr("class", "tree-tooltip")
            .style("position", "absolute")
            .style("opacity", 0)
            .style("background-color", "rgba(0, 0, 0, 0.9)")
            .style("color", "#FFFFFF")
            .style("padding", "10px")
            .style("border-radius", "8px")
            .style("box-shadow", "0 4px 8px rgba(0,0,0,0.3)")
            .style("pointer-events", "none")
            .style("z-index", "1000")
            .style("max-width", config.tooltipWidth + "px")
            .style("font-size", config.tooltipFontSize)
            .style("line-height", "1.4")
            .style("font-family", "monospace");
    }

    function setupTreeLayout() {
        // Tree layout will be configured in update function
    }

    function initializeRoot() {
        state.root = treeData;
        state.root.x0 = state.viewerHeight / 2;
        state.root.y0 = 0;

        // Collapse all nodes below the second level by default
        if (state.root.children) {
            state.root.children.forEach(collapse);
        }
    }

    function setupEventListeners() {
        // Window resize handler
        const debouncedResize = debounce(handleResize, 250);
        window.addEventListener('resize', debouncedResize);
        
        // Cleanup function for later use
        window.treeCleanup = function() {
            window.removeEventListener('resize', debouncedResize);
            if (state.tooltip) state.tooltip.remove();
            if (state.notification) state.notification.remove();
            if (state.tooltipDisableTimer) {
                clearTimeout(state.tooltipDisableTimer);
            }
        };
    }

    function renderInitialTree() {
        update(state.root);
        centerNode(state.root);
    }

    // Utility functions
    function visit(parent, visitFn, childrenFn) {
        if (!parent) return;

        visitFn(parent);

        const children = childrenFn(parent);
        if (children && children.length > 0) {
            children.forEach(child => visit(child, visitFn, childrenFn));
        }
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function handleZoom() {
        if (elements.svgGroup) {
            elements.svgGroup.attr("transform", 
                "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
        }
    }

    function handleResize() {
        try {
            state.viewerWidth = $(window).width() || window.innerWidth || 800;
            state.viewerHeight = $(window).height() || window.innerHeight || 600;
            
            if (elements.svg) {
                elements.svg
                    .attr("width", state.viewerWidth)
                    .attr("height", state.viewerHeight);
            }
            
            // Recalculate layout if root exists
            if (state.root) {
                update(state.root);
            }
        } catch (error) {
            console.error('Error handling resize:', error);
        }
    }

    function showErrorNotification(message) {
        showNotification(message, 'error');
    }

    function showNotification(message, type = 'info') {
        // Remove existing notification
        if (state.notification) {
            state.notification.remove();
        }

        const colors = {
            info: { bg: '#4CAF50', color: 'white' },
            error: { bg: '#f44336', color: 'white' },
            warning: { bg: '#ff9800', color: 'white' }
        };

        const color = colors[type] || colors.info;

        state.notification = d3.select("body")
            .append("div")
            .style("position", "fixed")
            .style("top", "20px")
            .style("right", "20px")
            .style("background", color.bg)
            .style("color", color.color)
            .style("padding", "12px 20px")
            .style("border-radius", "6px")
            .style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)")
            .style("z-index", "10000")
            .style("font-family", "Arial, sans-serif")
            .style("font-size", "14px")
            .style("max-width", "300px")
            .style("word-wrap", "break-word")
            .text(message);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (state.notification) {
                state.notification.transition()
                    .duration(500)
                    .style("opacity", 0)
                    .on("end", function() { 
                        if (state.notification) state.notification.remove(); 
                    });
            }
        }, 3000);
    }

    // Tree manipulation functions
    function collapse(d) {
        if (d.children) {
            d._children = d.children;
            d._children.forEach(collapse);
            d.children = null;
        }
    }

    function expand(d) {
        if (d._children) {
            d.children = d._children;
            d.children.forEach(expand);
            d._children = null;
        }
    }

    function toggleChildren(d) {
        if (d.children) {
            d._children = d.children;
            d.children = null;
        } else if (d._children) {
            d.children = d._children;
            d._children = null;
        }
        return d;
    }

    function sortTree(tree) {
        if (!tree) return;
        
        tree.sort(function(a, b) {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }

    // Node interaction functions
    function handleNodeClick(d) {
        if (d3.event.defaultPrevented) return;
        
        try {
            // Disable tooltips temporarily after click
            state.tooltipDisabled = true;
            
            // Clear any existing tooltip
            clearTooltip();
            
            // Clear any existing timer
            if (state.tooltipDisableTimer) {
                clearTimeout(state.tooltipDisableTimer);
            }
            
            // Re-enable tooltips after 500ms
            state.tooltipDisableTimer = setTimeout(() => {
                state.tooltipDisabled = false;
                state.tooltipDisableTimer = null;
            }, 500);
            
            let nodeToCenter = d;
            
            // If the node is collapsed, expand it (and its single-child descendants)
            if (d._children) {
                nodeToCenter = expandUntilMultipleChildren(d);
            } else if (d.children) {
                // If the node is expanded, collapse the entire subtree
                nodeToCenter = collapseSubtree(d);
            }
            update(d);
            centerNode(nodeToCenter);
        } catch (error) {
            console.error('Error handling node click:', error);
        }
    }

    function expandUntilMultipleChildren(d) {
        // If the node has children, expand it
        if (d._children) {
            d.children = d._children;
            d._children = null;
        }
        
        // If the node has exactly one child, recursively expand that child
        // and return the result of that expansion
        if (d.children && d.children.length === 1) {
            return expandUntilMultipleChildren(d.children[0]);
        }
        
        // Return this node if it has multiple children or no children
        return d;
    }

    function collapseSubtree(d) {
        // Store all children in _children and remove them from children
        if (d.children) {
            d._children = d.children;
            d.children = null;
        }
        return d;
    }

    function clearTooltip() {
        if (state.tooltip) {
            state.tooltip.transition()
                .duration(100)
                .style("opacity", 0);
        }
    }

    function calculateTooltipPosition(mouseX, mouseY) {
        // Get tooltip dimensions after it's been rendered
        const tooltipNode = state.tooltip.node();
        const tooltipRect = tooltipNode.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width;
        const tooltipHeight = tooltipRect.height;
        
        // Get window dimensions
        const windowWidth = window.innerWidth || document.documentElement.clientWidth;
        const windowHeight = window.innerHeight || document.documentElement.clientHeight;
        
        // Cursor dimensions (approximate)
        const cursorWidth = 20;
        const cursorHeight = 20;
        
        // Calculate initial position (default offset)
        let x = mouseX - config.tooltipOffset.x;
        let y = mouseY + config.tooltipOffset.y;
        
        // Adjust horizontal position to prevent overflow
        if (x + tooltipWidth > windowWidth) {
            // Tooltip would overflow right edge, position it to the left of the mouse
            x = mouseX - tooltipWidth - 10;
        }
        if (x < 0) {
            // Tooltip would overflow left edge, position it at the left edge with small margin
            x = 10;
        }
        
        // Adjust vertical position to prevent overflow
        if (y + tooltipHeight > windowHeight) {
            // Tooltip would overflow bottom edge, position it above the mouse
            y = mouseY - tooltipHeight - 10;
        }
        if (y < 0) {
            // Tooltip would overflow top edge, position it at the top edge with small margin
            y = 10;
        }
        
        // Check for cursor overlap and adjust if necessary
        const cursorLeft = mouseX;
        const cursorRight = mouseX + cursorWidth;
        const cursorTop = mouseY;
        const cursorBottom = mouseY + cursorHeight;
        
        const tooltipLeft = x;
        const tooltipRight = x + tooltipWidth;
        const tooltipTop = y;
        const tooltipBottom = y + tooltipHeight;
        
        // Check horizontal overlap
        if (tooltipLeft < cursorRight && tooltipRight > cursorLeft) {
            // Horizontal overlap detected - prioritize moving to the right
            const rightPosition = cursorRight + 5;
            const leftPosition = cursorLeft - tooltipWidth - 5;
            
            // Check if moving to the right would keep tooltip within window bounds
            if (rightPosition + tooltipWidth <= windowWidth) {
                // Prefer right side if it fits
                x = rightPosition;
            } else if (leftPosition >= 0) {
                // Fall back to left side if right doesn't fit but left does
                x = leftPosition;
            } else {
                // If neither side fits well, try to position as close to right edge as possible
                x = windowWidth - tooltipWidth - 10;
            }
        }
        
        // Check vertical overlap
        if (tooltipTop < cursorBottom && tooltipBottom > cursorTop) {
            // Vertical overlap detected
            if (y < mouseY) {
                // Tooltip is above cursor, move it further up
                y = cursorTop - tooltipHeight - 5;
            } else {
                // Tooltip is below cursor, move it further down
                y = cursorBottom + 5;
            }
        }
        
        // Final boundary check to ensure tooltip stays within window
        if (x + tooltipWidth > windowWidth) {
            x = windowWidth - tooltipWidth - 10;
        }
        if (x < 0) {
            x = 10;
        }
        if (y + tooltipHeight > windowHeight) {
            y = windowHeight - tooltipHeight - 10;
        }
        if (y < 0) {
            y = 10;
        }
        
        return { x, y };
    }

    function handleNodeMouseOver(d) {
        if (d === state.root || d.name === "QED" || !state.tooltip || state.tooltipDisabled) return;

        try {
            // Clear any existing tooltip first
            clearTooltip();

            d3.select(this).transition()
                .duration(100)
                .attr('opacity', 0.8);

            state.tooltip.transition()
                .duration(100)
                .style("opacity", 0.95);

            const tooltipContent = createTooltipContent(d);
            state.tooltip.html(tooltipContent);
            
            // Calculate optimal tooltip position considering window edges
            const position = calculateTooltipPosition(d3.event.pageX, d3.event.pageY);
            state.tooltip
                .style("left", position.x + "px")
                .style("top", position.y + "px");
        } catch (error) {
            console.error('Error handling mouseover:', error);
        }
    }

    function handleNodeMouseOut() {
        try {
            d3.select(this).transition()
                .duration(100)
                .attr('opacity', 1);

            // Use the clearTooltip function for consistency
            clearTooltip();
        } catch (error) {
            console.error('Error handling mouseout:', error);
        }
    }

    function handleNodeContextMenu(d) {
        d3.event.preventDefault();

        try {
            const script = getProofScript(d, "");
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(script).then(() => {
                    showNotification("Proof script copied to clipboard!", 'info');
                }).catch(() => {
                    fallbackCopyTextToClipboard(script);
                });
            } else {
                fallbackCopyTextToClipboard(script);
            }
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            showErrorNotification('Failed to copy proof script');
        }
    }

    function fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            showNotification("Proof script copied to clipboard!", 'info');
        } catch (err) {
            showErrorNotification('Failed to copy proof script');
        }
        
        document.body.removeChild(textArea);
    }

    function getProofScript(d, tail) {
        if (!d) return tail;
        
        const scriptTail = (d.name || '') + "\n" + tail;
        const parent = d.parent;
        
        if (parent) {
            if (parent.name === "Proof.") {
                return "Proof.\n" + scriptTail;
            }
            return getProofScript(parent, scriptTail);
        }
        return scriptTail;
    }

    function createTooltipContent(d) {
        if (!d) return '';

        try {
            const stylizeCoqString = (str) => {
                if (!str) return '';
                return str
                    .replace(/\bmatch\b/g, '<br/>match')
                    .replace(/\bend\b/g, '<br/>end')
                    .replace(/\|/g, '<br/>&nbsp;&nbsp;&nbsp;&nbsp;|');
            };

            const context = Array.isArray(d.proofcontext) ? d.proofcontext : [];
            const stylizedCtx = context.map(stylizeCoqString).join('<br/><br/>');
            const stylizedGoal = stylizeCoqString(d.proofgoal || '');

            return `
                ${`<div style="margin-bottom: 8px; color: #ADD8E6; font-weight: bold; text-align: center;">${"Proof state before tactic:"}</div>`}
                ${stylizedCtx ? `<div style="margin-bottom: 8px; color: #4CAF50;">${stylizedCtx}</div>` : ''}
                ${stylizedCtx || stylizedGoal ? '<hr style="margin: 8px 0; border-color: white;">' : ''}
                ${stylizedGoal ? `<div>${stylizedGoal}</div>` : ''}
            `;
        } catch (error) {
            console.error('Error creating tooltip content:', error);
            return `<div>Error displaying node information</div>`;
        }
    }

    // Layout and rendering functions
    function centerNode(source) {
        if (!source || !elements.zoomListener) return;

        try {
            const scale = elements.zoomListener.scale();
            let x = -source.y0;
            let y = -source.x0;
            x = x * scale + state.viewerWidth / 2;
            y = y * scale + state.viewerHeight / 2;
            
            d3.select('g').transition()
                .duration(config.duration)
                .attr("transform", "translate(" + x + "," + y + ")scale(" + scale + ")");
            
            elements.zoomListener.scale(scale);
            elements.zoomListener.translate([x, y]);
        } catch (error) {
            console.error('Error centering node:', error);
        }
    }

    function update(source) {
        if (!source || !elements.svgGroup) return;

        try {
            // Calculate new dimensions
            const levelWidth = [1];
            const childCount = function(level, n) {
                if (n.children && n.children.length > 0) {
                    if (levelWidth.length <= level + 1) levelWidth.push(0);
                    levelWidth[level + 1] += n.children.length;
                    n.children.forEach(function(d) {
                        childCount(level + 1, d);
                    });
                }
            };
            childCount(0, state.root);
            
            const newHeight = d3.max(levelWidth) * config.nodeSpacing;
            const tree = d3.layout.tree().size([newHeight, state.viewerWidth]);

            // Sort tree
            sortTree(tree);

            // Compute new tree layout
            const nodes = tree.nodes(state.root).reverse();
            const links = tree.links(nodes);

            // Set node positions with fixed level width
            nodes.forEach(function(d) {
                d.y = (d.depth * config.levelWidth);
            });

            // Update nodes
            const node = elements.svgGroup.selectAll("g.node")
                .data(nodes, function(d) {
                    return d.id || (d.id = ++state.nodeIdCounter);
                });

            // Enter new nodes
            const nodeEnter = node.enter().append("g")
                .attr("class", "node")
                .attr("transform", function(d) {
                    return "translate(" + source.y0 + "," + source.x0 + ")";
                })
                .on('click', handleNodeClick)
                .style("cursor", "pointer");

            // Add circles to new nodes
            nodeEnter.append("circle")
                .attr('class', 'nodeCircle')
                .attr("r", 0)
                .style("fill", function(d) {
                    return d._children ? "#4A90E2" : "#fff";
                })
                .style("stroke", "#555")
                .style("stroke-width", "2px")
                .on('mouseover', handleNodeMouseOver)
                .on('mouseout', handleNodeMouseOut)
                .on('contextmenu', handleNodeContextMenu);

            // Add text to new nodes with wrapping support
            nodeEnter.append("foreignObject")
                .attr("x", function(d) {
                    return d.children || d._children ? -config.maxTextWidth - 10 : 10;
                })
                .attr("y", -10)
                .attr("width", config.maxTextWidth)
                .attr("height", 40)
                .append("xhtml:div")
                .attr('class', 'nodeText')
                .style("font-size", "12px")
                .style("font-family", "monospace")
                .style("color", "#333")
                .style("word-wrap", "break-word")
                .style("overflow-wrap", "break-word")
                .style("line-height", "1.2")
                .style("text-align", function(d) {
                    return d.children || d._children ? "right" : "left";
                })
                .text(function(d) {
                    return d.name || '';
                });

            // Add ghost circle for better interaction
            nodeEnter.append("circle")
                .attr('class', 'ghostCircle')
                .attr("r", config.ghostCircleRadius)
                .attr("opacity", 0)
                .style("fill", "transparent")
                .attr('pointer-events', 'mouseover')
                .on("mouseover", function(node) {
                    state.selectedNode = node;
                })
                .on("mouseout", function(node) {
                    state.selectedNode = null;
                });

            // Update existing nodes
            node.select('foreignObject')
                .attr("x", function(d) {
                    return d.children || d._children ? -config.maxTextWidth - 10 : 10;
                })
                .select('div')
                .style("text-align", function(d) {
                    return d.children || d._children ? "right" : "left";
                })
                .text(function(d) {
                    return d.name || '';
                });

            node.select("circle.nodeCircle")
                .attr("r", config.nodeCircleRadius)
                .style("fill", function(d) {
                    return d._children ? "#4A90E2" : "#fff";
                });

            // Transition nodes to new positions
            const nodeUpdate = node.transition()
                .duration(config.duration)
                .attr("transform", function(d) {
                    return "translate(" + d.y + "," + d.x + ")";
                });

            nodeUpdate.select("foreignObject")
                .style("opacity", 1);

            // Transition exiting nodes
            const nodeExit = node.exit().transition()
                .duration(config.duration)
                .attr("transform", function(d) {
                    return "translate(" + source.y + "," + source.x + ")";
                })
                .remove();

            nodeExit.select("circle")
                .attr("r", 0);

            nodeExit.select("foreignObject")
                .style("opacity", 0);

            // Update links
            const link = elements.svgGroup.selectAll("path.link")
                .data(links, function(d) {
                    return d.target.id;
                });

            // Enter new links
            link.enter().insert("path", "g")
                .attr("class", "link")
                .style("fill", "none")
                .style("stroke", "#ccc")
                .style("stroke-width", "2px")
                .attr("d", function(d) {
                    const o = { x: source.x0, y: source.y0 };
                    return diagonal({ source: o, target: o });
                });

            // Transition links to new positions
            link.transition()
                .duration(config.duration)
                .attr("d", diagonal);

            // Transition exiting links
            link.exit().transition()
                .duration(config.duration)
                .attr("d", function(d) {
                    const o = { x: source.x, y: source.y };
                    return diagonal({ source: o, target: o });
                })
                .remove();

            // Store old positions for next transition
            nodes.forEach(function(d) {
                d.x0 = d.x;
                d.y0 = d.y;
            });

        } catch (error) {
            console.error('Error updating tree:', error);
            showErrorNotification('Error updating tree layout');
        }
    }

    // Diagonal projection for links
    const diagonal = d3.svg.diagonal()
        .projection(function(d) {
            return [d.y, d.x];
        });

    // Initialize the tree
    initialize();
}
