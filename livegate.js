var svgDocument;
var xmlns = "http://www.w3.org/2000/svg";


function on_load(evt) {
	svgDocument=evt.target.ownerDocument;
	svgDocument.getElementById("button").onclick = hide_button;
}

function unuse(use) {
	// Get the ID of the original element
	var origID = use.getAttribute("xlink:href").slice(1);
	
	// Get the original element
	var orig = svgDocument.getElementById(origID);
	
	// Deep-copy the original node but remove the ID
	var clone = orig.cloneNode(true);
	clone.removeAttribute("id");
	
	// Create a new group to replace the use with
	var group = svgDocument.createElementNS(xmlns, "g");
	
	// Add the original element to our new group
	group.appendChild(clone);
	
	// Transform the group to restore the position of the use
	group.setAttribute("transform", use.getAttribute("transform"))
	
	// Put the group in the place of the use
	use.parentNode.replaceChild(group, use);
	
	// Return a copy of the new cloned contents and the original object's ID
	return [clone, origID];
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

function getRealPathSegList(path) {
	var tMatrix = getRealMatrix(path);
	
	var realPathSegList = [];
	
	for (var i = 0 ; i < path.pathSegList.numberOfItems; i++) {
		var seg = path.pathSegList.getItem(i);
		
		if (seg.pathSegTypeAsLetter == "m") {
			// Move To
			realPathSegList.push({
				x: seg.x + tMatrix.e,
				y: seg.y + tMatrix.f,
			});
		} else if (seg.pathSegTypeAsLetter == "l") {
			// Relative To
			realPathSegList.push({
				x: realPathSegList[realPathSegList.length-1].x + seg.x,
				y: realPathSegList[realPathSegList.length-1].y + seg.y,
			});
		} else {
			console.warn("Unknown pathSegTypeAsLetter:", seg);
			return;
		}
	}
	
	return realPathSegList;
}


var components = {
	components : {},
	
	addInstance : function (instance, componentID) {
		if (this.components[componentID] != undefined) {
			this.components[componentID].push(instance);
		} else {
			this.components[componentID] = [instance];
		}
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
	
	var instances = {};
	
	var useTags = getUseTags();
	for (var i = 0; i < useTags.length; i++) {
		var response = unuse(useTags[i])
		var unused   = response[0];
		var origID   = response[1];
		components.addInstance(unused, origID);
		unused.lastElementChild.style.fill = "rgb(128,0,255)";
	}
	
	var pathsAtPoints = [];
	function addPathAtPoint(path, point) {
		// See if there is a path already at this point
		for (var i = 0; i < pathsAtPoints.length; i++) {
			if ((Math.abs(pathsAtPoints[i].point.x - point.x)
			     + Math.abs(pathsAtPoints[i].point.y - point.y))
			    < 0.001) {
				pathsAtPoints[i].paths.push(path);
				return;
			}
		}
		
		// If not, add this path as a new location
		pathsAtPoints.push({
			point: point,
			paths: [path],
		});
	}
	
	var paths = svgDocument.getElementsByTagName("path");
	for (var i = 0; i < paths.length; i++) {
		var path = paths[i];
		var segs = getRealPathSegList(path);
		if (segs != undefined) {
			for (var j = 0; j < segs.length; j++) {
				addPathAtPoint(path, segs[j]);
			}
		}
	}
	
	for (var i = 0; i < pathsAtPoints.length; i++) {
		var pathsAtPoint = pathsAtPoints[i];
		if (pathsAtPoint.paths.length > 1) {
			for (var j = 0; j < pathsAtPoint.paths.length; j++) {
				var path = pathsAtPoint.paths[j];
				path.style.stroke = "rgb(255,0,0)";
			}
		}
	}
	
	console.log(pathsAtPoints);
}
