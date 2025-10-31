// script.js — safe DOM timing (defer used in HTML), degree = max keys per node
window.addEventListener("DOMContentLoaded", () => {
  // DOM refs
  const svg = document.getElementById("treeCanvas");
  const degreeInput = document.getElementById("degreeInput");
  const keyInput = document.getElementById("keyInput");
  const insertBtn = document.getElementById("insertBtn");
  const searchBtn = document.getElementById("searchBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const resetBtn = document.getElementById("resetBtn");
  const resultBox = document.getElementById("resultBox");

  // B-Tree using "degree" = max keys per node (user requested).
  class BNode {
    constructor(degree, leaf = true) {
      this.degree = degree; // max keys allowed in node
      this.keys = [];
      this.children = [];
      this.leaf = leaf;
    }
    isFull() { return this.keys.length >= this.degree; }
  }

  class BTree {
    constructor(degree = 3) {
      this.degree = Math.max(2, Math.min(5, degree)); // clamp 2..5
      this.root = new BNode(this.degree, true);
    }

    // Search returns boolean
    search(k, node = this.root) {
      if (!node) return false;
      let i = 0;
      while (i < node.keys.length && k > node.keys[i]) i++;
      if (i < node.keys.length && node.keys[i] === k) return true;
      if (node.leaf) return false;
      return this.search(k, node.children[i]);
    }

    // Insert (standard split-before-descend)
    insert(k) {
      if (this.search(k)) return; // ignore duplicates
      const r = this.root;
      if (r.isFull()) {
        const s = new BNode(this.degree, false);
        s.children.push(r);
        this._splitChild(s, 0);
        this.root = s;
        this._insertNonFull(s, k);
      } else {
        this._insertNonFull(r, k);
      }
    }

    _insertNonFull(node, k) {
      let i = node.keys.length - 1;
      if (node.leaf) {
        // insert into sorted keys
        node.keys.push(k);
        node.keys.sort((a, b) => a - b);
      } else {
        while (i >= 0 && k < node.keys[i]) i--;
        i++;
        if (node.children[i].isFull()) {
          this._splitChild(node, i);
          if (k > node.keys[i]) i++;
        }
        this._insertNonFull(node.children[i], k);
      }
    }

    _splitChild(parent, i) {
      const deg = this.degree;
      const y = parent.children[i];
      const z = new BNode(deg, y.leaf);

      // choose mid index to promote
      const mid = Math.floor(deg / 2);

      // z gets keys after mid
      z.keys = y.keys.splice(mid + 1);
      // promoted key
      const promoted = y.keys.splice(mid, 1)[0];

      // move children if internal
      if (!y.leaf) {
        z.children = y.children.splice(mid + 1);
      }

      parent.keys.splice(i, 0, promoted);
      parent.children.splice(i + 1, 0, z);
    }

    // Delete implemented by rebuilding: safe and correct for this visual tool
    delete(k) {
      // collect all keys (in-order), filter out k, rebuild
      const arr = [];
      this._traverse(this.root, arr);
      const filtered = arr.filter(x => x !== k);
      this.root = new BNode(this.degree, true);
      for (const val of filtered) this.insert(val);
    }

    _traverse(node, arr) {
      if (!node) return;
      for (let i = 0; i < node.keys.length; i++) {
        if (!node.leaf) this._traverse(node.children[i], arr);
        arr.push(node.keys[i]);
      }
      if (!node.leaf) this._traverse(node.children[node.keys.length], arr);
    }
  }

  // Create initial tree
  let tree = new BTree(parseInt(degreeInput.value, 10) || 3);

  // UI hooks
  degreeInput.addEventListener("change", () => {
    const d = parseInt(degreeInput.value, 10);
    if (Number.isNaN(d) || d < 2 || d > 5) {
      resultBox.textContent = "Degree must be 2–5.";
      return;
    }
    tree = new BTree(d);
    resultBox.textContent = `Degree set to ${d}. Tree reset.`;
    draw();
  });

  insertBtn.addEventListener("click", () => {
    const v = parseInt(keyInput.value, 10);
    if (Number.isNaN(v)) return;
    tree.insert(v);
    resultBox.textContent = `Inserted ${v}.`;
    keyInput.value = "";
    draw();
  });

  searchBtn.addEventListener("click", () => {
    const v = parseInt(keyInput.value, 10);
    if (Number.isNaN(v)) return;
    const found = tree.search(v);
    resultBox.textContent = found ? `Found ${v}.` : `${v} not found.`;
  });

  deleteBtn.addEventListener("click", () => {
    const v = parseInt(keyInput.value, 10);
    if (Number.isNaN(v)) return;
    tree.delete(v);
    resultBox.textContent = `Deleted ${v} (if present).`;
    keyInput.value = "";
    draw();
  });

  resetBtn.addEventListener("click", () => {
    const d = parseInt(degreeInput.value, 10) || 3;
    tree = new BTree(d);
    resultBox.textContent = "Tree reset.";
    draw();
  });

  // -------- Drawing helpers --------
  function draw() {
    svg.innerHTML = "";
    if (!tree.root || (tree.root.keys.length === 0 && tree.root.children.length === 0)) {
      // nothing to draw
      return;
    }

    // layout constants
    const slotW = 60;       // width per key slot
    const nodeH = 40;
    const vGap = 90;        // vertical gap
    const hGap = 18;        // minimal horizontal spacing between child subtrees
    const topMargin = 90;   // move root down so it doesn't touch header

    // compute subtree widths and positions
    const positions = new Map();

    function layout(node) {
      if (!node) return 0;
      // node's width = max(keys * slotW, sum(children widths + gaps))
      const selfW = Math.max(1, node.keys.length) * slotW;
      if (node.leaf || node.children.length === 0) {
        positions.set(node, { width: selfW });
        return selfW;
      }
      // internal: sum children widths + gaps
      let total = 0;
      const childWidths = [];
      for (let c of node.children) {
        const w = layout(c);
        childWidths.push(w);
        total += w;
      }
      total += Math.max(0, (node.children.length - 1)) * hGap;
      const nodeW = Math.max(selfW, total);
      positions.set(node, { width: nodeW, childWidths });
      return nodeW;
    }

    layout(tree.root);

    // draw recursively; x is center
    function drawNode(node, centerX, y) {
      if (!node) return;
      const pos = positions.get(node);
      const nodeW = Math.max(1, node.keys.length) * slotW;
      const leftX = centerX - nodeW / 2;

      // draw node rect
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", leftX);
      rect.setAttribute("y", y);
      rect.setAttribute("width", nodeW);
      rect.setAttribute("height", nodeH);
      rect.setAttribute("class", "node-rect");
      svg.appendChild(rect);

      // draw slot dividers and keys
      const slots = Math.max(1, node.keys.length);
      const slotWidth = nodeW / slots;
      for (let i = 0; i < slots; i++) {
        if (i > 0) {
          const div = document.createElementNS("http://www.w3.org/2000/svg", "line");
          div.setAttribute("x1", leftX + i * slotWidth);
          div.setAttribute("y1", y + 4);
          div.setAttribute("x2", leftX + i * slotWidth);
          div.setAttribute("y2", y + nodeH - 4);
          div.setAttribute("class", "slot-divider");
          svg.appendChild(div);
        }
        if (i < node.keys.length) {
          const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.setAttribute("x", leftX + i * slotWidth + slotWidth / 2);
          t.setAttribute("y", y + nodeH / 2 + 4);
          t.setAttribute("class", "key-text");
          t.textContent = node.keys[i];
          svg.appendChild(t);
        }
      }

      // draw children (if any)
      if (!node.leaf && node.children.length > 0) {
        // compute starting left for children block
        const childWidths = pos.childWidths;
        let totalChildrenWidth = childWidths.reduce((a, b) => a + b, 0) + Math.max(0, (childWidths.length - 1)) * hGap;
        // center children block under the node rect center:
        let startLeft = centerX - totalChildrenWidth / 2;
        for (let i = 0; i < node.children.length; i++) {
          const cw = childWidths[i];
          const childCenter = startLeft + cw / 2;

          // connector from gap position (evenly spaced connectors across nodeW)
          const connectorX = leftX + (i + 0.5) * (nodeW / node.children.length);
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", connectorX);
          line.setAttribute("y1", y + nodeH);
          line.setAttribute("x2", childCenter);
          line.setAttribute("y2", y + vGap);
          line.setAttribute("class", "link-line");
          svg.appendChild(line);

          drawNode(node.children[i], childCenter, y + vGap);
          startLeft += cw + hGap;
        }
      }
    }

    // center whole tree horizontally in SVG using total width from positions map
    const totalWidth = positions.get(tree.root).width || 0;
    const svgWidth = svg.clientWidth || 1200;
    const rootCenter = Math.max(svgWidth / 2, totalWidth / 2);
    drawNode(tree.root, svgWidth / 2, topMargin);
  }

  // initial draw
  draw();
});


