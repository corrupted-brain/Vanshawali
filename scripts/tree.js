// DEPRECATED. TO BE REMOVED
/* global d3, $, jsyaml*/

var publicTree;
var running = 1; // number of running asynchronous functions

function parseTree(tree, replace) {
    if (typeof replace !== 'undefined') {
        replace.children = tree.children;
        parseTree(tree);
    } else if (tree.source) {
        running++;
        d3.json(tree.source, function(error, treeData) {
            running--;
            parseTree(treeData, tree);
        });
    } else if (tree.children) {
        $(tree.children).each(function() {
            parseTree(this);
        });
    }
}

$.get('data/trans.yml').done(function(dataStr) {
    console.log(dataStr);
    const treeData = jsyaml.load(dataStr);
    publicTree = treeData;
    parseTree(publicTree);
    running--;
});

function checkIfDone() {
    if (running > 0) {
        setTimeout(checkIfDone, 100);
    } else {
        drawTree(publicTree);
    }
}
checkIfDone();

function drawTree(treeData) {
    var vertical = false;

    var totalNodes = 0;
    var maxLabelLength = 0;
    var panSpeed = 200;
    var panBoundary = 20;
    var i = 0;
    var duration = 750;
    var root;
    var maxDepth = 0;

    var viewerWidth = $(document).width();
    var viewerHeight = $(document).height();

    var tree = d3.layout.tree().size([viewerHeight, viewerWidth]);

    var diagonal = d3.svg.diagonal().projection(function(d) {
        return vertical ? [d.x, d.y] : [d.y, d.x];
    });

    function englishName(d) {
        return d['english-name'] ? d['english-name'] : d.name;
    }

    function visit(parent, visitFn, childrenFn) {
        if (!parent) return;
        visitFn(parent);
        var children = childrenFn(parent);
        if (children) {
            children.forEach(function(child) {
                visit(child, visitFn, childrenFn);
            });
        }
    }

    visit(treeData, function(d) {
        totalNodes++;
        maxLabelLength = Math.max(englishName(d).length, maxLabelLength);
    }, function(d) {
        return d.children && d.children.length > 0 ? d.children : null;
    });

    function pan(domNode, direction) {
        var speed = panSpeed;
        if (panTimer) {
            clearTimeout(panTimer);
            var translateCoords = d3.transform(svgGroup.attr('transform'));
            var translateX = direction == 'left' ? translateCoords.translate[0] + speed : translateCoords.translate[0] - speed;
            var translateY = direction == 'up' ? translateCoords.translate[1] + speed : translateCoords.translate[1] - speed;
            var scale = zoomListener.scale();
            svgGroup.transition().attr('transform', 'translate(' + translateX + ',' + translateY + ')scale(' + scale + ')');
            zoomListener.translate([translateX, translateY]);
            panTimer = setTimeout(function() {
                pan(domNode, speed, direction);
            }, 50);
        }
    }

    function zoom() {
        svgGroup.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
    }

    var zoomListener = d3.behavior
        .zoom()
        .scaleExtent([0.1, 3]) // Set minimum zoom level to 0.1 for maximum zoom-out
        .on('zoom', zoom);

    var baseSvg = d3
        .select('#tree-container')
        .append('svg')
        .attr('width', viewerWidth)
        .attr('height', viewerHeight)
        .attr('class', 'overlay')
        .call(zoomListener);

    function centerNode(source) {
        var scale = 0.1; // Set minimum zoom level
        var x = -source.y0;
        var y = -source.x0;
        x = x * scale + viewerWidth / 2;
        y = y * scale + viewerHeight / 2;
        d3.select('g')
            .transition()
            .duration(duration)
            .attr('transform', 'translate(' + x + ',' + y + ')scale(' + scale + ')');
        zoomListener.translate([x, y]).scale(scale);
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

    function click(d) {
        if (d3.event.defaultPrevented) return;
        d = toggleChildren(d);
        update(d);
        centerNode(d);
    }

    function update(source) {
        var levelWidth = [1];
        var childCount = function(level, n) {
            if (n.children && n.children.length > 0) {
                if (levelWidth.length <= level + 1) levelWidth.push(0);
                levelWidth[level + 1] += n.children.length;
                n.children.forEach(function(d) {
                    childCount(level + 1, d);
                });
            }
        };
        childCount(0, root);
        var newHeight = d3.max(levelWidth) * 70;
        tree = tree.size([newHeight, viewerWidth]);

        var nodes = tree.nodes(root).reverse(),
            links = tree.links(nodes);

        nodes.forEach(function(d) {
            if (d.depth > maxDepth) maxDepth = d.depth;
            d.y = d.depth * (maxLabelLength * (vertical ? 5 : 8));
        });

        var node = svgGroup.selectAll('g.node').data(nodes, function(d) {
            return d.id || (d.id = ++i);
        });

        var nodeEnter = node.enter().append('g').attr('class', 'node').attr('transform', function(d) {
            return vertical ? 'translate(' + source.x0 + ',' + source.y0 + ')' : 'translate(' + source.y0 + ',' + source.x0 + ')';
        }).on('click', click);

        nodeEnter.append('circle').attr('class', 'nodeCircle').attr('r', 10).style('fill', function(d) {
            return d._children ? 'lightsteelblue' : '#fff';
        });

        nodeEnter.append('text').attr('x', -20).attr('dy', '.35em').attr('class', 'nodeText').attr('text-anchor', 'end').text(function(d) {
            return englishName(d);
        }).style('fill-opacity', 0);

        var nodeUpdate = node.transition().duration(duration).attr('transform', function(d) {
            return vertical ? 'translate(' + d.x + ',' + d.y + ')' : 'translate(' + d.y + ',' + d.x + ')';
        });

        nodeUpdate.select('text').style('fill-opacity', 1);

        var nodeExit = node.exit().transition().duration(duration).attr('transform', function(d) {
            return vertical ? 'translate(' + source.x + ',' + source.y + ')' : 'translate(' + source.y + ',' + source.x + ')';
        }).remove();

        nodeExit.select('circle').attr('r', 0);
        nodeExit.select('text').style('fill-opacity', 0);

        var link = svgGroup.selectAll('path.link').data(links, function(d) {
            return d.target.id;
        });

        link.enter().insert('path', 'g').attr('class', 'link').style('stroke-width', function(d) {
            return 3 * (maxDepth - d.source.depth) + 'px';
        }).attr('d', function(d) {
            var o = {x: source.x0, y: source.y0};
            return diagonal({source: o, target: o});
        });

        link.transition().duration(duration).attr('d', diagonal);
        link.exit().transition().duration(duration).attr('d', function(d) {
            var o = {x: source.x, y: source.y};
            return diagonal({source: o, target: o});
        }).remove();

        nodes.forEach(function(d) {
            d.x0 = d.x;
            d.y0 = d.y;
        });
    }

    var svgGroup = baseSvg.append('g');

    root = treeData;
    root.x0 = viewerHeight / 2;
    root.y0 = 0;

    update(root);
    centerNode(root);
}
