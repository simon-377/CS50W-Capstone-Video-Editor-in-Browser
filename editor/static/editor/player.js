const player = {};


player.initialize = function() {

    // Get the video players
    this.v1 = document.getElementById('v1');
    this.v2 = document.getElementById('v2');
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = 1280;
    this.height = 720;

    // Store active player, v1 is default
    this.active = this.v1;

    // Functions, defined below player.initialize
    this.switch;
    this.load;
    this.play;
    this.goTo;
    this.inactive;
    this.draw;
    this.updateStuff;
}


// Load a file into a player
player.load = function(clips, clipIndex, video) {
    
    // If no argument is provided, player that isn't active is modified
    if (video == null) {
        video = this.inactive();
    }
    const clip = clips[clipIndex];
    console.log(video.id + " is loading " + clip.file.id);

    // There is a better way for safari, but I can't test it right now
    video.src && URL.revokeObjectURL(video.src);
    video.src = URL.createObjectURL(clip.file);

    this.updateStuff(clips, clipIndex, video);
    
    return video;
}


player.updateStuff = function(clips, clipIndex, video) {

    const clip = clips[clipIndex];

    video.fileId = clip.file.id;
    video.clip = clip;

    // Include a bunch of stuff to avoid expensive operations in frame callback
    video.clipIndex = clipIndex;
    video.switchTime = clip.timelineIn + clip.length();
    video.isLastVideo = clipIndex + 1 >= clips.length;

    // Play video in inactive player before switching if possible for smooth cut
    if (!video.isLastVideo) {
        video.playTime = clips[clipIndex + 1].in > .5 ? video.switchTime - .5 
                                                    : video.switchTime;
    } else {
        video.playTime = video.switchTime;
    }
}


// This gets called a lot when moving playhead manually
// Goes to a particular time and displays frame
player.goTo = function(time) {
    this.active.currentTime = time;
    this.ctx.drawImage(this.active, 0, 0, this.width, this.height);
}


// Draw frame
player.draw = function() {
    this.ctx.drawImage(this.active, 0, 0, this.width, this.height);
}


// Switch to other player
player.switch = function(video) {

    // If no argument is provided, switch to player that isn't active
    if (video == null) {
        video = this.inactive();
    }

    video.muted = false;

    // Change active player and bring the callback, return this.active
    this.active = video;
    this.inactive().muted = true;

    console.log(video.id + ' is active');

    return video;
}


// Get inactive player
player.inactive = function() {
    return this.active == v1 ? v2 : v1;
}


player.play = function(inst) {

    this.active.playbackRate = 1;
    inst == 'play' && this.active.play();
    inst == 'pause' && this.active.play();
    if (inst != null) return;

    // Play or pause active player
    if (this.active.paused) {
        this.active.play();
    } else {
        this.active.pause();
    }

    return !this.active.paused;
}


// Ensures both player have loaded
// Always clipIndex of current clip: timeline.getClip()
player.check = function(clips, clipIndex, time) {

    // Check active player, switch to inactive if loaded there
    if (this.active.clipIndex != clipIndex) {
        if(this.inactive().clipIndex == clipIndex) {
            this.switch();
        } else {
            this.load(clips, clipIndex, this.active);
        }
    }
    
    // Check inactive if not last clip
    if (this.inactive().clipIndex != clipIndex + 1) {
        clips.length > clipIndex + 1 && this.load(clips, clipIndex + 1);
    }

    // Update properties on active and inactive player
    this.updateStuff(clips, clipIndex, this.active);
    clips.length > clipIndex + 1 && this.updateStuff(clips, clipIndex + 1, this.inactive());

    this.active.currentTime = time - this.active.clip.timelineIn + this.active.clip.in;
}


export {player};