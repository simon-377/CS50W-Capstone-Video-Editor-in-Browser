// This file only includes this object
const timeline = {};


// Initialize the timeline object
timeline.initialize = function initialize(playheadCallback) {

    // Array of clips placed in timeline
    this.clips = [];
    this.totalLength = 0;

    // Time where playhead is, scroll of screen (offset)
    // zoom -> default 1px == 1sec, multiplied
    // 1px == this.zoom number of seconds
    this.time = 0;
    this.offset = 0;
    this.zoom = 1;
    this.justZoomed = false;
    
    // Canvas and context
    this.canvas = document.getElementById('timeline-time');
    this.ctx = this.canvas.getContext('2d');
    
    // Functions, they are defined below timeline.initialize
    this.draw;
    this.updatePlayheadPos;
    this.handleZoom;
    this.getClip;

    // Gets called when Playhead is moved manually by user; not required
    // Use with this.getClip
    this.requestPlayheadCallback = playheadCallback;

    // Redraw canvas when resize
    $(window).resize(() => this.draw())

    // Handle playhead repositioning
    $('#timeline-container, #timeline-time').on('mousedown',(e) => {

        this.updatePlayheadPos(e);
        
        // Stop on release, it is important to .off() mouseup, too
        $(document).mouseup(() => {
            $(document).off("mousemove mouseup");
        })

        // After that, keep updating whenever mouse moves
        $(document).mousemove((e) => {
            this.updatePlayheadPos(e);
        })
    });

    // Handle zoom, add listener to the container of the clips and the canvas
    // Also handles horizontal scrolling
    $('#timeline-container, #timeline-time').on('wheel', (e) => {
        this.handleZoom(e);
    })
    
    $('#timeline-container').on('scroll', (e) => {
        
        // Move timeline only when scrolling horizontally not when zooming
        // Contains number of pixels hidden left
        const scroll = $('#timeline-container').scrollLeft();

        // If we are not zooming, move timemarkers on canvas
        if (this.justZoomed) {
            this.justZoomed = false;
        } else {
            this.offset = scroll / this.zoom;
        }
        this.draw();
    })
};


// Handle zooming into timeline using mouse wheel
timeline.handleZoom = function(e) {

    e.preventDefault();
    const tmp = this.zoom;

    // Only care about vertical scroll
    if (!e.originalEvent.deltaY) {
        return;
    }
    
    // Multiply or divide zoom by 2 and update time markers and playhead
    this.zoom = e.originalEvent.deltaY < 0 ? this.zoom * 2 : this.zoom / 2;
    
    // Min and max zoom
    if (this.zoom < .1 || this.zoom > 40) {
        this.zoom = tmp;
        return;
    }
    
    // Current playhead pos = (this.time - this.offset) * this.zoom
    // We want this to be in middle of screen = this.canvas.width / 2
    // Set the two equal and solve for this.offset since that is what we are adjusting
    const newOffset = (this.time - this.canvas.width / (2 * this.zoom));
    
    // Modify divsize
    this.clips && this.clips.forEach((ele) => {
        $(ele).css("width", (ele.length() * this.zoom) + "px");
    })

    // Center view on playhead before zoom if scrollbar exists and there is enough space
    if (this.totalLength * this.zoom < this.canvas.width) {
        this.offset = 0
    } else {
        this.offset = Math.max(0, newOffset);
        $('#timeline-container').scrollLeft(this.offset * this.zoom);
        
        // Cap offset of canvas by using scrollbar, not ideal
        if (this.offset * this.zoom > $('#timeline-container').scrollLeft()) {
            this.offset = $('#timeline-container').scrollLeft() / this.zoom;
        }
        
        // If zooming and scrollbar exists, we need to know that for horizontal scrolling
        if ($('#timeline-container').scrollLeft() > 0) {
            this.justZoomed = true;
        }
    }
    this.draw();
}


// Update playhead position based on mouse click stored in event
// checkHeight is bool, e is event
timeline.updatePlayheadPos = function(e) {    
    
    // https://stackoverflow.com/questions/17130395/real-mouse-position-in-canvas
    const rect = this.canvas.getBoundingClientRect(); 
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Make sure you didn't click too low
    // Prevents conflicting behaviour with scrollbar
    if (y > this.canvas.height * .7) return;
    
    // Update time and redraw, prevent moving playhead too far left
    // Check that user did not click too low
    this.time = this.offset + (x / this.zoom) <= this.totalLength ?
                this.offset + (x / this.zoom) : (this.totalLength - this.offset);
    if (this.time < 0) this.time = 0;
    if (this.clips.length != 0) {
        this.requestPlayheadCallback != null && this.requestPlayheadCallback();
    }
    this.draw();
}


// Draw timemarkers and playhead on canvas
timeline.draw = function() {

    // https://stackoverflow.com/questions/1248081/how-to-get-the-browser-viewport-dimensions
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    // Clear previous drawing, might be faster to seperate playhead and time markers
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Resize canvas in html not css to keep (px to seconds) relation
    this.canvas.width = '' + (vw > 990 ? .94 * vw : .85 * vw);
    this.canvas.height = '' + (.09 * vh);
    const width = this.canvas.width;

    // Draw playhead if it is on screen
    const playHeadPosition = (this.time - this.offset) * this.zoom;
    this.ctx.beginPath();
    this.ctx.moveTo(playHeadPosition, 0);
    this.ctx.lineTo(playHeadPosition, this.canvas.height - 26);
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = '#ff0000';
    this.ctx.stroke();

    // Initialize variables for how frequent lines should be (in pixels)
    const timeMarkerFrequency = 5;
    const move = this.zoom * timeMarkerFrequency;
    
    // Initial offset
    let lineX = - (this.offset * this.zoom) % (timeMarkerFrequency * this.zoom);

    // Every minute, there should be a big marker, account for offset
    const bigLineOffset = Math.floor((this.offset % 60) / timeMarkerFrequency);
    const bigLineFrequency = Math.floor(60 / timeMarkerFrequency);

    // Draw time markers
    let counter = bigLineOffset;
    while (lineX < width) {
        this.ctx.beginPath();
        this.ctx.moveTo(lineX, 0);

        // Draw longer line every 60 seconds
        this.ctx.lineTo(lineX, (counter % bigLineFrequency == 0 ? 15 : 7));
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.stroke();

        // Move pointer
        lineX += move;
        counter++;
    }
};


// Transform timeline.time into clips[] index
// O(n), Gets called a lot when manually repositioning playhead :/
// I am not sure how else to approach this, n == this.clips.length
timeline.getClip = function() {
    let index;
    for (let i = 0; i < this.clips.length; i++) {
        if (this.clips[i].timelineIn <= this.time) {
            index = i;
        } else {
            break;
        }
    }
    return index;
};


// Arg: [...$('#timeline-container').children()]
// Be sure to update .in and .out of some clip first, if needed
timeline.updateClips = function (clips) {
    let time = 0;
    clips.forEach((ele, i) => {
        ele.clipIndex = i;
        ele.timelineIn = time;
        time += ele.length();
        ele.id = 'c' + i;
        $(ele).css("width", (ele.length() * this.zoom) + "px");
    })
    this.clips = clips;
    this.totalLength = time;
}


export {timeline};