var URI = require('urijs');
var core = require('./core');

/**
  EPUB CFI spec: http://www.idpf.org/epub/linking/cfi/epub-cfi.html

  Implements:
  - Character Offset: epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)
  - Simple Ranges : epubcfi(/6/4[chap01ref]!/4[body01]/10[para05],/2/1:1,/3:4)

  Does Not Implement:
  - Temporal Offset (~)
  - Spatial Offset (@)
  - Temporal-Spatial Offset (~ + @)
  - Text Location Assertion ([)
*/

function EpubCFI(cfiFrom, base, ignoreClass){
  var type;

  this.str = '';

  this.base = {};
  this.spinePos = 0; // For compatibility

  this.range = false; // true || false;

  this.path = {};
  this.start = null;
  this.end = null;

  // Allow instantiation without the 'new' keyword
  if (!(this instanceof EpubCFI)) {
    return new EpubCFI(cfiFrom, base, ignoreClass);
  }

  if(typeof base === 'string') {
    this.base = this.parseComponent(base);
  } else if(typeof base === 'object' && base.steps) {
    this.base = base;
  }

  type = this.checkType(cfiFrom);


  if(type === 'string') {
    this.str = cfiFrom;
    return core.extend(this, this.parse(cfiFrom));
  } else if (type === 'range') {
    return core.extend(this, this.fromRange(cfiFrom, this.base, ignoreClass));
  } else if (type === 'node') {
    return core.extend(this, this.fromNode(cfiFrom, this.base, ignoreClass));
  } else if (type === 'EpubCFI' && cfiFrom.path) {
    return cfiFrom;
  } else if (!cfiFrom) {
    return this;
  } else {
    throw new TypeError('not a valid argument for EpubCFI');
  }

};

EpubCFI.prototype.checkType = function(cfi) {

  if (this.isCfiString(cfi)) {
    return 'string';
  // Is a range object
  } else if (typeof cfi === 'object' && core.type(cfi) === "Range"){
    return 'range';
  } else if (typeof cfi === 'object' && cfi instanceof window.Node ){ // || typeof cfi === 'function'
    return 'node';
  } else if (typeof cfi === 'object' && cfi instanceof EpubCFI){
    return 'EpubCFI';
  } else {
    return false;
  }
};

EpubCFI.prototype.parse = function(cfiStr) {
  var cfi = {
      spinePos: -1,
      range: false,
      base: {},
      path: {},
      start: null,
      end: null
    };
  var baseComponent, pathComponent, range;

  if(typeof cfiStr !== "string") {
    return {spinePos: -1};
  }

  if(cfiStr.indexOf("epubcfi(") === 0 && cfiStr[cfiStr.length-1] === ")") {
    // Remove intial epubcfi( and ending )
    cfiStr = cfiStr.slice(8, cfiStr.length-1);
  }

  baseComponent = this.getChapterComponent(cfiStr);

  // Make sure this is a valid cfi or return
  if(!baseComponent) {
    return {spinePos: -1};
  }

  cfi.base = this.parseComponent(baseComponent);

  pathComponent = this.getPathComponent(cfiStr);
  cfi.path = this.parseComponent(pathComponent);

  range = this.getRange(cfiStr);

  if(range) {
    cfi.range = true;
    cfi.start = this.parseComponent(range[0]);
    cfi.end = this.parseComponent(range[1]);
  }

  // Get spine node position
  // cfi.spineSegment = cfi.base.steps[1];

  // Chapter segment is always the second step
  cfi.spinePos = cfi.base.steps[1].index;

  return cfi;
};

EpubCFI.prototype.parseComponent = function(componentStr){
  var component = {
    steps: [],
    terminal: {
      offset: null,
      assertion: null
    }
  };
  var parts = componentStr.split(':');
  var steps = parts[0].split('/');
  var terminal;

  if(parts.length > 1) {
    terminal = parts[1];
    component.terminal = this.parseTerminal(terminal);
  }

  if (steps[0] === '') {
    steps.shift(); // Ignore the first slash
  }

  component.steps = steps.map(function(step){
    return this.parseStep(step);
  }.bind(this));

  return component;
};

EpubCFI.prototype.parseStep = function(stepStr){
  var type, num, index, has_brackets, id;

  has_brackets = stepStr.match(/\[(.*)\]/);
  if(has_brackets && has_brackets[1]){
    id = has_brackets[1];
  }

  //-- Check if step is a text node or element
  num = parseInt(stepStr);

  if(isNaN(num)) {
    return;
  }

  if(num % 2 === 0) { // Even = is an element
    type = "element";
    index = num / 2 - 1;
  } else {
    type = "text";
    index = (num - 1 ) / 2;
  }

  return {
    "type" : type,
    'index' : index,
    'id' : id || null
  };
};

EpubCFI.prototype.parseTerminal = function(termialStr){
  var characterOffset, textLocationAssertion;
  var assertion = termialStr.match(/\[(.*)\]/);

  if(assertion && assertion[1]){
    characterOffset = parseInt(termialStr.split('[')[0]) || null;
    textLocationAssertion = assertion[1];
  } else {
    characterOffset = parseInt(termialStr) || null;
  }

  return {
    'offset': characterOffset,
    'assertion': textLocationAssertion
  };

};

EpubCFI.prototype.getChapterComponent = function(cfiStr) {

  var indirection = cfiStr.split("!");

  return indirection[0];
};

EpubCFI.prototype.getPathComponent = function(cfiStr) {

  var indirection = cfiStr.split("!");

  if(indirection[1]) {
    ranges = indirection[1].split(',');
    return ranges[0];
  }

};

EpubCFI.prototype.getRange = function(cfiStr) {

  var ranges = cfiStr.split(",");

  if(ranges.length === 3){
    return [
      ranges[1],
      ranges[2]
    ];
  }

  return false;
};

EpubCFI.prototype.getCharecterOffsetComponent = function(cfiStr) {
  var splitStr = cfiStr.split(":");
  return splitStr[1] || '';
};

EpubCFI.prototype.joinSteps = function(steps) {
  return steps.map(function(part){
    var segment = '';

    if(part.type === 'element') {
      segment += (part.index + 1) * 2;
    }

    if(part.type === 'text') {
      segment += 1 + (2 * part.index); // TODO: double check that this is odd
    }

    if(part.id) {
      segment += "[" + part.id + "]";
    }

    return segment;

  }).join('/');

};

EpubCFI.prototype.segmentString = function(segment) {
  var segmentString = '/';

  segmentString += this.joinSteps(segment.steps);

  if(segment.terminal && segment.terminal.offset != null){
    segmentString += ':' + segment.terminal.offset;
  }

  if(segment.terminal && segment.terminal.assertion != null){
    segmentString += '[' + segment.terminal.assertion + ']';
  }

  return segmentString;
};

EpubCFI.prototype.toString = function() {
  var cfiString = 'epubcfi(';

  cfiString += this.segmentString(this.base);

  cfiString += '!';
  cfiString += this.segmentString(this.path);

  // Add Range, if present
  if(this.start) {
    cfiString += ',';
    cfiString += this.segmentString(this.start);
  }

  if(this.end) {
    cfiString += ',';
    cfiString += this.segmentString(this.end);
  }

  cfiString += ")";

  return cfiString;
};

EpubCFI.prototype.compare = function(cfiOne, cfiTwo) {
  if(typeof cfiOne === 'string') {
    cfiOne = new EpubCFI(cfiOne);
  }
  if(typeof cfiTwo === 'string') {
    cfiTwo = new EpubCFI(cfiTwo);
  }
  // Compare Spine Positions
  if(cfiOne.spinePos > cfiTwo.spinePos) {
    return 1;
  }
  if(cfiOne.spinePos < cfiTwo.spinePos) {
    return -1;
  }


  // Compare Each Step in the First item
  for (var i = 0; i < cfiOne.path.steps.length; i++) {
    if(!cfiTwo.path.steps[i]) {
      return 1;
    }
    if(cfiOne.path.steps[i].index > cfiTwo.path.steps[i].index) {
      return 1;
    }
    if(cfiOne.path.steps[i].index < cfiTwo.path.steps[i].index) {
      return -1;
    }
    // Otherwise continue checking
  }

  // All steps in First equal to Second and First is Less Specific
  if(cfiOne.path.steps.length < cfiTwo.path.steps.length) {
    return 1;
  }

  // Compare the charecter offset of the text node
  if(cfiOne.path.terminal.offset > cfiTwo.path.terminal.offset) {
    return 1;
  }
  if(cfiOne.path.terminal.offset < cfiTwo.path.terminal.offset) {
    return -1;
  }

  // TODO: compare ranges

  // CFI's are equal
  return 0;
};

EpubCFI.prototype.step = function(node) {
  var nodeType = (node.nodeType === Node.TEXT_NODE) ? 'text' : 'element';

  return {
    'id' : node.id,
    'tagName' : node.tagName,
    'type' : nodeType,
    'index' : this.position(node)
  };
};

EpubCFI.prototype.filteredStep = function(node, ignoreClass) {
  var filteredNode = this.filter(node, ignoreClass);
  var nodeType;

  // Node filtered, so ignore
  if (!filteredNode) {
    return;
  }

  // Otherwise add the filter node in
  nodeType = (filteredNode.nodeType === Node.TEXT_NODE) ? 'text' : 'element';

  return {
    'id' : filteredNode.id,
    'tagName' : filteredNode.tagName,
    'type' : nodeType,
    'index' : this.filteredPosition(filteredNode, ignoreClass)
  };
};

EpubCFI.prototype.pathTo = function(node, offset, ignoreClass) {
  var segment = {
    steps: [],
    terminal: {
      offset: null,
      assertion: null
    }
  };
  var currentNode = node;
  var step;

  while(currentNode && currentNode.parentNode &&
        currentNode.parentNode.nodeType != Node.DOCUMENT_NODE) {

    if (ignoreClass) {
      step = this.filteredStep(currentNode, ignoreClass);
    } else {
      step = this.step(currentNode);
    }

    if (step) {
      segment.steps.unshift(step);
    }

    currentNode = currentNode.parentNode;

  }

  if (offset != null && offset >= 0) {

    segment.terminal.offset = offset;

    // Make sure we are getting to a textNode if there is an offset
    if(segment.steps[segment.steps.length-1].type != "text") {
      segment.steps.push({
        'type' : "text",
        'index' : 0
      });
    }

  }


  return segment;
}

EpubCFI.prototype.equalStep = function(stepA, stepB) {
  if (!stepA || !stepB) {
    return false;
  }

  if(stepA.index === stepB.index &&
     stepA.id === stepB.id &&
     stepA.type === stepB.type) {
    return true;
  }

  return false;
};
EpubCFI.prototype.fromRange = function(range, base, ignoreClass) {
  var cfi = {
      range: false,
      base: {},
      path: {},
      start: null,
      end: null
    };

  var start = range.startContainer;
  var end = range.endContainer;

  var startOffset = range.startOffset;
  var endOffset = range.endOffset;

  var needsIgnoring = false;

  if (ignoreClass) {
    // Tell pathTo if / what to ignore
    needsIgnoring = (start.ownerDocument.querySelector('.' + ignoreClass) != null);
  }


  if (typeof base === 'string') {
    cfi.base = this.parseComponent(base);
    cfi.spinePos = cfi.base.steps[1].index;
  } else if (typeof base === 'object') {
    cfi.base = base;
  }

  if (range.collapsed) {
    if (needsIgnoring) {
      startOffset = this.patchOffset(start, startOffset, ignoreClass);
    }
    cfi.path = this.pathTo(start, startOffset, ignoreClass);
  } else {
    cfi.range = true;

    if (needsIgnoring) {
      startOffset = this.patchOffset(start, startOffset, ignoreClass);
    }

    cfi.start = this.pathTo(start, startOffset, ignoreClass);

    if (needsIgnoring) {
      endOffset = this.patchOffset(end, endOffset, ignoreClass);
    }

    cfi.end = this.pathTo(end, endOffset, ignoreClass);

    // Create a new empty path
    cfi.path = {
      steps: [],
      terminal: null
    };

    // Push steps that are shared between start and end to the common path
    var len = cfi.start.steps.length;
    var i;

    for (i = 0; i < len; i++) {
      if (this.equalStep(cfi.start.steps[i], cfi.end.steps[i])) {
        if(i == len-1) {
          // Last step is equal, check terminals
          if(cfi.start.terminal === cfi.end.terminal) {
            // CFI's are equal
            cfi.path.steps.push(cfi.start.steps[i]);
            // Not a range
            cfi.range = false;
          }
        } else {
          cfi.path.steps.push(cfi.start.steps[i]);
        }

      } else {
        break;
      }
    };

    cfi.start.steps = cfi.start.steps.slice(cfi.path.steps.length);
    cfi.end.steps = cfi.end.steps.slice(cfi.path.steps.length);

    // TODO: Add Sanity check to make sure that the end if greater than the start
  }

  return cfi;
}

EpubCFI.prototype.fromNode = function(anchor, base, ignoreClass) {
  var cfi = {
      range: false,
      base: {},
      path: {},
      start: null,
      end: null
    };

  var needsIgnoring = false;

  if (ignoreClass) {
    // Tell pathTo if / what to ignore
    needsIgnoring = (anchor.ownerDocument.querySelector('.' + ignoreClass) != null);
  }

  if (typeof base === 'string') {
    cfi.base = this.parseComponent(base);
    cfi.spinePos = cfi.base.steps[1].index;
  } else if (typeof base === 'object') {
    cfi.base = base;
  }

  cfi.path = this.pathTo(anchor, null, ignoreClass);

  return cfi;
};


EpubCFI.prototype.filter = function(anchor, ignoreClass) {
  var needsIgnoring;
  var sibling; // to join with
  var parent, prevSibling, nextSibling;
  var isText = false;

  if (anchor.nodeType === Node.TEXT_NODE) {
    isText = true;
    parent = anchor.parentNode;
    needsIgnoring = anchor.parentNode.classList.contains(ignoreClass);
  } else {
    isText = false;
    needsIgnoring = anchor.classList.contains(ignoreClass);
  }

  if (needsIgnoring && isText) {
    previousSibling = parent.previousSibling;
    nextSibling = parent.nextSibling;

    // If the sibling is a text node, join the nodes
    if (previousSibling && previousSibling.nodeType === Node.TEXT_NODE) {
      sibling = previousSibling;
    } else if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
      sibling = nextSibling;
    }

    if (sibling) {
      return sibling;
    } else {
      // Parent will be ignored on next step
      return anchor;
    }

  } else if (needsIgnoring && !isText) {
    // Otherwise just skip the element node
    return false;
  } else {
    // No need to filter
    return anchor;
  }

};

EpubCFI.prototype.patchOffset = function(anchor, offset, ignoreClass) {
  var needsIgnoring;
  var sibling;

  if (anchor.nodeType != Node.TEXT_NODE) {
    console.error("Anchor must be a text node");
    return;
  }

  var curr = anchor;
  var totalOffset = offset;

  // If the parent is a ignored node, get offset from it's start
  if (anchor.parentNode.classList.contains(ignoreClass)) {
    curr = anchor.parentNode;
  }

  while (curr.previousSibling) {
    if(curr.previousSibling.nodeType === Node.ELEMENT_NODE) {
      // Originally a text node, so join
      if(curr.previousSibling.classList.contains(ignoreClass)){
        totalOffset += curr.previousSibling.textContent.length;
      } else {
        break; // Normal node, dont join
      }
    } else {
      // If the previous sibling is a text node, join the nodes
      totalOffset += curr.previousSibling.textContent.length;
    }

    curr = curr.previousSibling;
  }

  return totalOffset;

};

EpubCFI.prototype.normalizedMap = function(children, nodeType, ignoreClass) {
  var output = {};
  var prevIndex = -1;
  var i, len = children.length;
  var currNodeType;
  var prevNodeType;

  for (i = 0; i < len; i++) {

    currNodeType = children[i].nodeType;

    // Check if needs ignoring
    if (currNodeType === Node.ELEMENT_NODE &&
        children[i].classList.contains(ignoreClass)) {
      currNodeType = Node.TEXT_NODE;
    }

    if (i > 0 &&
        currNodeType === Node.TEXT_NODE &&
        prevNodeType === Node.TEXT_NODE) {
      // join text nodes
      output[i] = prevIndex;
    } else if (nodeType === currNodeType){
      prevIndex = prevIndex + 1;
      output[i] = prevIndex;
    }

    prevNodeType = currNodeType;

  }

  return output;
};

EpubCFI.prototype.position = function(anchor) {
  var children, index, map;

  if (anchor.nodeType === Node.ELEMENT_NODE) {
    children = anchor.parentNode.children;
    index = Array.prototype.indexOf.call(children, anchor);
  } else {
    children = this.textNodes(anchor.parentNode);
    index = children.indexOf(anchor);
  }

  return index;
};

EpubCFI.prototype.filteredPosition = function(anchor, ignoreClass) {
  var children, index, map;

  if (anchor.nodeType === Node.ELEMENT_NODE) {
    children = anchor.parentNode.children;
    map = this.normalizedMap(children, Node.ELEMENT_NODE, ignoreClass);
  } else {
    children = anchor.parentNode.childNodes;
    // Inside an ignored node
    if(anchor.parentNode.classList.contains(ignoreClass)) {
      anchor = anchor.parentNode;
      children = anchor.parentNode.childNodes;
    }
    map = this.normalizedMap(children, Node.TEXT_NODE, ignoreClass);
  }


  index = Array.prototype.indexOf.call(children, anchor);

  return map[index];
};

EpubCFI.prototype.stepsToXpath = function(steps) {
  var xpath = [".", "*"];

  steps.forEach(function(step){
    var position = step.index + 1;

    if(step.id){
      xpath.push("*[position()=" + position + " and @id='" + step.id + "']");
    } else if(step.type === "text") {
      xpath.push("text()[" + position + "]");
    } else {
      xpath.push("*[" + position + "]");
    }
  });

  return xpath.join("/");
};


/*

To get the last step if needed:

// Get the terminal step
lastStep = steps[steps.length-1];
// Get the query string
query = this.stepsToQuery(steps);
// Find the containing element
startContainerParent = doc.querySelector(query);
// Find the text node within that element
if(startContainerParent && lastStep.type == "text") {
  container = startContainerParent.childNodes[lastStep.index];
}
*/
EpubCFI.prototype.stepsToQuerySelector = function(steps) {
  var query = ["html"];

  steps.forEach(function(step){
    var position = step.index + 1;

    if(step.id){
      query.push("#" + step.id);
    } else if(step.type === "text") {
      // unsupported in querySelector
      // query.push("text()[" + position + "]");
    } else {
      query.push("*:nth-child(" + position + ")");
    }
  });

  return query.join(">");

};

EpubCFI.prototype.textNodes = function(container, ignoreClass) {
  return Array.prototype.slice.call(container.childNodes).
    filter(function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return true;
      } else if (ignoreClass && node.classList.contains(ignoreClass)) {
        return true;
      }
      return false;
    });
};

EpubCFI.prototype.walkToNode = function(steps, _doc, ignoreClass) {
  var doc = _doc || document;
  var container = doc.documentElement;
  var step;
  var len = steps.length;
  var i;

  for (i = 0; i < len; i++) {
    step = steps[i];

    if(step.type === "element") {
      container = container.children[step.index];
    } else if(step.type === "text"){
      container = this.textNodes(container, ignoreClass)[step.index];
    }

  };

  return container;
};

EpubCFI.prototype.findNode = function(steps, _doc, ignoreClass) {
  var doc = _doc || document;
  var container;
  var xpath;

  if(!ignoreClass && typeof doc.evaluate != 'undefined') {
    xpath = this.stepsToXpath(steps);
    container = doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  } else if(ignoreClass) {
    container = this.walkToNode(steps, doc, ignoreClass);
  } else {
    container = this.walkToNode(steps, doc);
  }

  return container;
};

EpubCFI.prototype.fixMiss = function(steps, offset, _doc, ignoreClass) {
  var container = this.findNode(steps.slice(0,-1), _doc, ignoreClass);
  var children = container.childNodes;
  var map = this.normalizedMap(children, Node.TEXT_NODE, ignoreClass);
  var i;
  var child;
  var len;
  var childIndex;
  var lastStepIndex = steps[steps.length-1].index;

  for (var childIndex in map) {
    if (!map.hasOwnProperty(childIndex)) return;

    if(map[childIndex] === lastStepIndex) {
      child = children[childIndex];
      len = child.textContent.length;
      if(offset > len) {
        offset = offset - len;
      } else {
        if (child.nodeType === Node.ELEMENT_NODE) {
          container = child.childNodes[0];
        } else {
          container = child;
        }
        break;
      }
    }
  }

  return {
    container: container,
    offset: offset
  };

};

EpubCFI.prototype.toRange = function(_doc, ignoreClass) {
  var doc = _doc || document;
  var range = doc.createRange();
  var start, end, startContainer, endContainer;
  var cfi = this;
  var startSteps, endSteps;
  var needsIgnoring = ignoreClass ? (doc.querySelector('.' + ignoreClass) != null) : false;
  var missed;

  if (cfi.range) {
    start = cfi.start;
    startSteps = cfi.path.steps.concat(start.steps);
    startContainer = this.findNode(startSteps, doc, needsIgnoring ? ignoreClass : null);
    end = cfi.end;
    endSteps = cfi.path.steps.concat(end.steps);
    endContainer = this.findNode(endSteps, doc, needsIgnoring ? ignoreClass : null);
  } else {
    start = cfi.path;
    startSteps = cfi.path.steps;
    startContainer = this.findNode(cfi.path.steps, doc, needsIgnoring ? ignoreClass : null);
  }

  if(startContainer) {
    try {

      if(start.terminal.offset != null) {
        range.setStart(startContainer, start.terminal.offset);
      } else {
        range.setStart(startContainer, 0);
      }

    } catch (e) {
      missed = this.fixMiss(startSteps, start.terminal.offset, doc, needsIgnoring ? ignoreClass : null);
      range.setStart(missed.container, missed.offset);
    }
  } else {
    // No start found
    return null;
  }

  if (endContainer) {
    try {

      if(end.terminal.offset != null) {
        range.setEnd(endContainer, end.terminal.offset);
      } else {
        range.setEnd(endContainer, 0);
      }

    } catch (e) {
      missed = this.fixMiss(endSteps, cfi.end.terminal.offset, doc, needsIgnoring ? ignoreClass : null);
      range.setEnd(missed.container, missed.offset);
    }
  }


  // doc.defaultView.getSelection().addRange(range);
  return range;
};

// is a cfi string, should be wrapped with "epubcfi()"
EpubCFI.prototype.isCfiString = function(str) {
  if(typeof str === 'string' &&
      str.indexOf("epubcfi(") === 0 &&
      str[str.length-1] === ")") {
    return true;
  }

  return false;
};

EpubCFI.prototype.generateChapterComponent = function(_spineNodeIndex, _pos, id) {
  var pos = parseInt(_pos),
    spineNodeIndex = _spineNodeIndex + 1,
    cfi = '/'+spineNodeIndex+'/';

  cfi += (pos + 1) * 2;

  if(id) {
    cfi += "[" + id + "]";
  }

  return cfi;
};

module.exports = EpubCFI;
