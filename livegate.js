var svgDocument;
var xmlns = "http://www.w3.org/2000/svg";

////////////////////////////////////////////////////////////////////////////////
// Simulation Components
////////////////////////////////////////////////////////////////////////////////

function Simulator() {
	// Current simulation time
	this.time = -1;
	
	// Run-queues
	this.ready     = [];
	this.inactive  = [];
	this.postponed = {};
}
Simulator.prototype = {
	doNow : function (f) {
		this.ready.push(f);
	},
	
	doLater : function (f, delay) {
		if (delay == undefined)
			this.inactive.push(f);
		else
			this.doAtTime(f, this.time + delay);
	},
	
	doAtTime : function (f, time) {
		if (this.postponed[time] == undefined)
			this.postponed[time] = [];
		
		this.postponed[time].push(f);
	},
	
	onstart : function (f) {
		this.doAtTime(f, 0);
	},
	
	_processReady : function () {
		while (this.ready.length > 0)
			this.ready.shift()();
	},
	
	processTimestep : function () {
		// Advance the timestep
		this.time++;
		
		if (this.postponed[this.time]) {
			while (this.postponed[this.time].length > 0)
				this.ready.push(this.postponed[this.time].shift());
			delete this.postponed[this.time];
		}
		
		// Run the simulation until the timestep is complete
		while (this.ready.length > 0) {
			this._processReady();
			
			// Make inactive jobs active
			this.ready = this.inactive;
			this.inactive = [];
		}
	},
}



function Variable(simulator) {
	this.simulator = simulator;
	
	this.value = null;
	
	// Trigger events
	this.triggerOnChange  = [];
	this.triggerOnPosedge = [];
	this.triggerOnNegedge = [];
	
	this.paths = [];
}
Variable.prototype = {
	addPath : function (path) {
		// Add this path to the list of paths
		this.paths.push(path);
		
		// Marge in the variable the path was already connected to
		if (path.variable) {
			this.merge(path.variable);
		}
		
		// Set the variable for the path
		path.variable = this;
	},
	
	
	merge : function (that) {
		// Merge another variable into this same variable
		while (that.paths.length != 0) {
			var path = that.paths.pop();
			path.variable = this;
			if (this.paths.indexOf(path) == -1)
				this.paths.push(path);
		}
	},
	
	
	// Request scheduling after a given event
	onchange  : function (f) { this.triggerOnChange.push(f); },
	onposedge : function (f) { this.triggerOnPosedge.push(f); },
	onnegedge : function (f) { this.triggerOnNegedge.push(f); },
	
	
	get : function () {
		return this.value;
	},
	
	set : function (new_value) {
		var old_value = this.value;
		this.value = new_value;
		
		// Trigger sensitive events
		this.triggerOnChange.forEach(function (f) { this.simulator.doNow(f); });
		
		if (old_value != new_value) {
			// Edge Triggering
			if (this.value)
				this.triggerOnPosedge.forEach(function (f) { this.simulator.doNow(f); });
			else
				this.triggerOnNegedge.forEach(function (f) { this.simulator.doNow(f); });
		}
	},
	
	setLater : function (new_value, delay) {
		var thisvar = this;
		this.simulator.doLater(function () {
			thisvar.set(new_value);
		}, delay);
	},
}

////////////////////////////////////////////////////////////////////////////////
// Design Elaboration
////////////////////////////////////////////////////////////////////////////////

// Remove ID attributes from this node and any of its children
function removeIDs(node) {
	// If this node has an ID, remove it
	if (node.removeAttribute)
		node.removeAttribute("id");
	
	// Recurse through its children
	for (var i = 0; i < node.childElementCount; i++)
		removeIDs(node.childNodes[i]);
}

// Convert a use tag into a deep copy of the object it is cloning
function unuse(use) {
	// Get the ID of the original element
	var origID = use.getAttribute("xlink:href").slice(1);
	
	// Get the original element
	var orig = svgDocument.getElementById(origID);
	
	// Deep-copy the original node but remove the ID
	var clone = orig.cloneNode(true);
	removeIDs(clone);
	
	// Create a new group to replace the use with
	var group = svgDocument.createElementNS(xmlns, "g");
	
	// Add the original element to our new group
	group.appendChild(clone);
	
	// Transform the group to restore the position of the use
	group.setAttribute("transform", use.getAttribute("transform"))
	
	// Put the group in the place of the use
	use.parentNode.replaceChild(group, use);
	
	// Return a copy of the new cloned contents and the original object's ID
	return clone;
}


// Get an array containing all use tags.
// Kind-of a hack as the result of getElementsByTagName is not a static array so
// needs copying if any use tags are going to be removed while iterating over
// the list.
function getUseTags() {
	var nodeList = svgDocument.getElementsByTagName("use");
	var useTags = [];
	for (var i = 0; i < nodeList.length; i++) {
		useTags.push(nodeList[i]);
	}
	return useTags;
}


// Get the matrix used to transform the coordinates in this node to screen
// coordinates.
function getRealMatrix(node) {
	if (node.nodeName == "svg") {
		// Root node
		return svgDocument.documentElement.createSVGMatrix();
	} else {
		var parentMatrix = getRealMatrix(node.parentElement);
		
		if (node.transform.baseVal.numberOfItems == 0) {
			return parentMatrix;
		} else if (node.transform.baseVal.numberOfItems == 1) {
			return parentMatrix.multiply(node.transform.baseVal.getItem(0).matrix);
		} else {
			//console.warn("Couldn't get real position of element with more than one matrix", node);
			return parentMatrix;
		}
	}
}


// A key-array associative store
function KeyValues() {
	this.keys   = [];
	this.values = [];
}
KeyValues.prototype = {
	pushIntoKey : function (key, value) {
		for (var i = 0; i < this.keys.length; i++)
			if (this.keys[i] == key)
				return this.values[i].push(value);
		
		this.keys.push(key);
		this.values.push([value]);
	},
	
	getValues : function (key) {
		for (var i = 0; i < this.keys.length; i++)
			if (this.keys[i] == key)
				return this.values[i];
		return [];
	},
}


// Get the DOM object which a use tag is a clone of
function getUseOriginal(use) {
	return svgDocument.getElementById(use.getAttribute("xlink:href").slice(1));
}


// Test to see if a dom-object is a use-clone of the given dom object
function isUseOf(use, original) {
	return ("#" + original.getAttribute("id")) == use.getAttribute("xlink:href");
}


// Turn all use tags in the document into literal copies.
// This function is careful to do this in the correct order to ensure that any
// level of nesting of use tags will work correclty.
function unuseAll() {
	// Build up a dictionary of use-sources to use tags (XXX: not needed, just a
	// list of sources)
	var uses      = svgDocument.getElementsByTagName("use");
	var originals = new KeyValues();
	for (var i = 0; i < uses.length; i++) {
		var use = uses[i];
		var original = getUseOriginal(use);
		originals.pushIntoKey(original, use);
	}
	
	// Build up a graph of use dependencies
	var graph = new KeyValues();
	for (var i = 0; i < originals.keys.length; i++) {
		var original = originals.keys[i];
		
		var childUseTags = original.getElementsByTagName("use");
		if (childUseTags.length == 0) {
			// No dependencies
			graph.pushIntoKey(null, original);
		} else {
			for (var j = 0; j < childUseTags.length; j++) {
				graph.pushIntoKey(getUseOriginal(childUseTags[j]), original);
			}
		}
	}
	
	// Traverse the graph of originals and convert all uses of each original in
	// such an order that no uses are converted that are part of the original of
	// any unconverted use.
	function traverse (original) {
		// Flag this node as visited (unless this is the 'root')
		if (original != null)
			original.visited = true;
		
		// Depth-first
		var children = graph.getValues(original);
		for (var i = 0; i < children.length; i++)
			if (!children[i].visited)
				traverse(children[i]);
		
		// Un-useify all the uses of this original
		var uses = getUseTags();
		for (var i = 0; i < uses.length; i++)
			if (isUseOf(uses[i], original))
				unuse(uses[i]);
	}
	traverse(null);
}


// A point in the SVG
function Point(x, y) {
	this.x = x;
	this.y = y;
}
Point.prototype = {
	// Compares position only approximately as float errors mean lines which are
	// exactly at the same position don't always have the same coordinates.
	equals : function (that) {
		return ((Math.abs(this.x - that.x)
		         + Math.abs(this.y - that.y))
		        < 0.001);
	}
}


// Turn a path dom object into a list of Points (if possible)
function pathToPoints(path) {
	var tMatrix = getRealMatrix(path);
	
	var realPathSegList = [];
	
	for (var i = 0 ; i < path.pathSegList.numberOfItems; i++) {
		var seg = path.pathSegList.getItem(i);
		
		if (seg.pathSegTypeAsLetter == "m") {
			// Move To
			realPathSegList.push(new Point(
				seg.x + tMatrix.e,
				seg.y + tMatrix.f
			));
		} else if (seg.pathSegTypeAsLetter == "l") {
			// Relative To
			realPathSegList.push(new Point(
				realPathSegList[realPathSegList.length-1].x + seg.x,
				realPathSegList[realPathSegList.length-1].y + seg.y
			));
		} else {
			//console.warn("Unknown pathSegTypeAsLetter:", seg);
			return;
		}
	}
	
	return realPathSegList;
}


// Convert a list of dom path objects into a list of {point:Point, paths:[...]}
function getPathsAtPoints(paths) {
	var pathsAtPoints = [];
	function addPathAtPoint(path, point) {
		// See if there is a path already at this point
		for (var i = 0; i < pathsAtPoints.length; i++)
			if (pathsAtPoints[i].point.equals(point))
				return pathsAtPoints[i].paths.push(path);
		
		// If not, add this path as a new location
		pathsAtPoints.push({
			point: point,
			paths: [path],
		});
	}
	
	for (var i = 0; i < paths.length; i++) {
		var points = pathToPoints(paths[i]);
		
		// Note presence of path at each point
		if (points != undefined)
			for (var j = 0; j < points.length; j++)
				addPathAtPoint(paths[i], points[j]);
	}
	
	return pathsAtPoints;
}


// Assign a variable to all connected paths.
function assignVariablesToPaths(simulator, paths) {
	var pathsAtPoints = getPathsAtPoints(paths);
	
	for (var i = 0; i < pathsAtPoints.length; i++) {
		var pathsAtPoint = pathsAtPoints[i];
		var paths = pathsAtPoint.paths;
		
		// The variable the paths at this point are connected to
		var variable = new Variable(simulator);
		
		for (var j = 0; j < pathsAtPoint.paths.length; j++)
			variable.addPath(pathsAtPoint.paths[j]);
	}
}


// Initialise a DOM element which is a cell
function initialiseCell(simulator, cell) {
	// Use the inkscape description as the code to initialise this cell
	var code = cell.getElementsByTagName("desc")[0].textContent;
	
	if (code) {
		// A dictionary of ports
		var port  = {};
		
		// Extract the ports as the labelled paths
		var paths = cell.getElementsByTagName("path");
		for (var i = 0; i < paths.length; i++) {
			var path = paths[i];
			var name = path.getAttribute("inkscape:label");
			var variable = path.variable;
			if (name != null)
				port[name] = variable;
		}
		
		var dom = cell;
		
		// Execute the code
		eval(code);
	}
}


////////////////////////////////////////////////////////////////////////////////

var simulator;

function on_load(evt) {
	svgDocument=evt.target.ownerDocument;
	
	// Create a simulator
	simulator = new Simulator();
	
	// Deep-copy all clones
	unuseAll();
	
	// Assign variables to all paths
	assignVariablesToPaths(simulator, svgDocument.getElementsByTagName("path"));
	
	var cells = svgDocument.getElementsByTagName("g");
	for (var i = 0; i < cells.length; i++) {
		var cell  = cells[i];
		var label = cell.getAttribute("inkscape:label");
		if (label != null && label.split(":")[0] == "cell")
			initialiseCell(simulator, cell);
	}
	
	svgDocument.getElementById("button").onclick = button_press;
}


function tick_simulation () {
	var changed = simulator.processTimestep();
	//console.log(simulator.time + ": " + changed);
	
	var wires = svgDocument.getElementsByTagName("path");
	for (var i = 0; i < wires.length; i ++) {
		if (wires[i].variable) {
			wires[i].style.stroke = wires[i].variable.get() ? "rgb(255,0,0)" : "rgb(0,0,0)" ;
		}
	}
}

var intervalID = null;
function button_press () {
	if (intervalID == null) {
		intervalID = setInterval("tick_simulation();", 200);
	} else {
		clearInterval(intervalID);
		intervalID = null;
	}
}
