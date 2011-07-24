var svgDocument;
var xmlns = "http://www.w3.org/2000/svg";


function on_load(evt) {
	svgDocument=evt.target.ownerDocument;
	svgDocument.getElementById("button").onclick = hide_button;
}

function removeIDs(node) {
	if (node.removeAttribute)
		node.removeAttribute("id");
	for (var i = 0; i < node.childElementCount; i++)
		removeIDs(node.childNodes[i]);
}

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

function getUseTags() {
	var nodeList = svgDocument.getElementsByTagName("use");
	var useTags = [];
	for (var i = 0; i < nodeList.length; i++) {
		useTags.push(nodeList[i]);
	}
	return useTags;
}


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
			console.warn("Couldn't get real position of element with more than one matrix", node);
			return parentMatrix;
		}
	}
}

function getRealPos(node) {
	if (node.nodeName == "svg") {
		// Root node
		return [0,0];
	} else {
		var parentPos = getRealPos(node.parentElement);
		
		if (node.transform.baseVal.numberOfItems == 0) {
			return parentPos;
		} else if (node.transform.baseVal.numberOfItems == 1) {
			var x = parentPos[0] + node.transform.baseVal.getItem(0).matrix.e;
			var y = parentPos[1] + node.transform.baseVal.getItem(0).matrix.f;
			return [x,y];
		} else {
			console.warn("Couldn't get real position of element with more than one matrix", node);
			return parentPos;
		}
	}
}

//var components = {
//	components : {},
//	
//	addInstance : function (instance, componentID) {
//		if (this.components[componentID] != undefined) {
//			this.components[componentID].push(instance);
//		} else {
//			this.components[componentID] = [instance];
//		}
//	}
//}

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

function getUseOriginal(use) {
	return svgDocument.getElementById(use.getAttribute("xlink:href").slice(1));
}

function isUseOf(use, original) {
	return ("#" + original.getAttribute("id")) == use.getAttribute("xlink:href");
}

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


function Point(x, y) {
	this.x = x;
	this.y = y;
}
Point.prototype = {
	equals : function (that) {
		return ((Math.abs(this.x - that.x)
		         + Math.abs(this.y - that.y))
		        < 0.001);
	}
}


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
			console.warn("Unknown pathSegTypeAsLetter:", seg);
			return;
		}
	}
	
	return realPathSegList;
}

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


function Variable() {
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
}


function assignVariablesToPaths(paths) {
	var pathsAtPoints = getPathsAtPoints(paths);
	
	for (var i = 0; i < pathsAtPoints.length; i++) {
		var pathsAtPoint = pathsAtPoints[i];
		var paths = pathsAtPoint.paths;
		
		// The variable the paths at this point are connected to
		var variable = new Variable();
		
		for (var j = 0; j < pathsAtPoint.paths.length; j++)
			variable.addPath(pathsAtPoint.paths[j]);
	}
}


function hide_button () {
	//alert(svgDocument.getElementById("register").getElementsByTagName("desc")[0].textContent);
	
	//var orig   = svgDocument.getElementById("register");
	//var clone  = orig.cloneNode(true);
	//var newreg = svgDocument.createElementNS(xmlns, "g");
	//var oldreg = svgDocument.getElementById("dupe");
	//newreg.appendChild(clone);
	//
	//var oldmatrix  = clone.transform.baseVal.getItem(0).matrix;
	//var origmatrix = orig.transform.baseVal.getItem(0).matrix;
	//
	//newreg.setAttribute("transform", oldreg.getAttribute("transform"))
	//
	//oldreg.parentNode.replaceChild(newreg, oldreg);
	//newreg.setAttribute("id", "dupe");
	//svgDocument.getElementById("dupe").lastElementChild.lastElementChild.style.stroke = "rgb(128,0,255)";
	
	//var unused = unuse(svgDocument.getElementById("dupe"));
	//unused.lastElementChild.style.stroke = "rgb(128,0,255)";
	//console.log(unused);
	
	//var instances = {};
	//
	//var useTags = getUseTags();
	//for (var i = 0; i < useTags.length; i++) {
	//	var response = unuse(useTags[i])
	//	var unused   = response[0];
	//	var origID   = response[1];
	//	components.addInstance(unused, origID);
	//	unused.lastElementChild.style.fill = "rgb(128,0,255)";
	//}
	//console.log(useTags);
	
	unuseAll();
	
	var paths = svgDocument.getElementsByTagName("path");
	assignVariablesToPaths(paths);
	
	for (var i = 0; i < paths.length; i++) {
		if (paths[i].variable) {
			r = Math.floor(Math.random()*255);
			g = Math.floor(Math.random()*255);
			b = Math.floor(Math.random()*255);
			paths[i].variable.paths.forEach(function (val) {
				val.style.stroke = "rgb(" + r + "," + g + "," + b + ")";
			});
		}
	}
}
