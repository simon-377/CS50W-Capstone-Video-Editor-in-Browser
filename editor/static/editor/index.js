import {timeline} from './timeline.js'
import {player} from './player.js'

// idCounter is for media files, the other is clips in timeline
let idCounter = 0;
let clipIdCounter = 0;

// These are for the frame callback, not sure how else to do it
$(document).ready(() => {

    // Get current path and display it;
    let loc = document.location.pathname;
    displaySite(loc);

    // Make anchors change displayed site and update url without reload
    $('.nav-item, .navbar-brand').click((e) => {
        const href = $(e.target).attr('href');
        window.history.pushState(href, '', href);
        loc = document.location.pathname;
        displaySite(loc);
    })
});


const displaySite = (loc) => {

    // Display site
    let isSite = false;
    $('#index-body').children().each((_, elem) => {

        // ID's of the divs are the same as pathnames, so I just need to show where equal
        const match = loc == $(elem).attr('id');
        match ? $(elem).show() : $(elem).hide();

        // Remember if match was found
        if (match) {
            isSite = true;
        }
    })

    // Account for people entering non existing site
    if (!isSite) {
        window.location.replace("/");
    }

    // Call functions to handle the individual sites
    if (loc == "/login") {
        login()
    } else if (loc == "/register") {
        register(true);
    } else if(loc == "/") {
        editor();
    }
};


const login = () => {

    // re-use template from /register
    $('#\\/register').show();

    // Remove confirm password input
    $('#pw-confirm').parent().hide();

    // re-use register function with different input
    register(false);
}


// Handle register site
// I am refreshing anyway if successful, but don't want to for message
const register = (isRegister) => {

    // Remove event listeners if still present from editor
    $(document).off();

    let csrfToken = $('input[name=csrfmiddlewaretoken]').val();

    // Show confirm password input if in /register not /login
    isRegister && $('#pw-confirm').parent().show();

    // Remove event listeners (matters if you first visit /register, then /login)
    $('#register-form').off('submit');

    $('#register-form').submit((e) => {

        e.preventDefault();

        // Get data
        const username = $('#username').val();
        const password = $('#pw').val();

        // Will be empty string if login, shouldn't matter due to submitting to different routes
        const pwConfirm = $('#pw-confirm').val();

        // Send data to /register or /login
        $.ajax({
            type: "POST",
            url: isRegister ? "/register" : "/login",
            data: {
                username: username,
                password: password,
                pwConfirm: pwConfirm,
                csrfmiddlewaretoken: csrfToken
            },
            success: function (response) {

                // Remember new token
                csrfToken = response.csrfToken;

                // Send back do editor if login/register succesful
                if (response.success) {
                    $('#register-message').hide();
                    window.location.replace("/");
                } else {
                    $('#register-message').show();
                    const messageElem = $('#register-message').children()[0];
                    $(messageElem).html(response.message);
                }
            }
        });
    })
};


const editor = () => {

    // Remove event listeners if they exist
    $(document).off();

    // Initialize timeline object
    timeline.initialize(playheadCallback);
    timeline.draw();

    // Initialize video player
    player.initialize();

    // Prevent browser from opening file itself on drop
    $(document).on('dragover dragenter drop', (e) => {
        e.preventDefault();
    });
    
    // Handle files being dropped into media pool
    $('#media-container').on('drop', (e) => {
        dropHandler(e);
    });
    
    // Keyboard shortcuts for player
    $(document).keydown((e) => { 
        handleShortCuts(e);
    });

};


const dropHandler = async (e) => {    
        
    e.preventDefault();

    // Get dropped files and remember how much media already existed
    const dropContent = e.originalEvent.dataTransfer;

    // If it is a video file append to media array
    console.log(dropContent);  
    for await (const item of [...dropContent.files]) {
        
        // Check if video
        if (item.type.split("/")[0] == "video") {
            
            // Guarantee unique id with global
            idCounter++;
            const id = "f" + (idCounter);

            // Get video duration by creating hidden html player temporarily
            const url = URL.createObjectURL(item);
            $('#player-container').append('<video hidden muted src="' + url + '" id="' + id +'"></video>');
            $('#' + id).on('loadedmetadata', (e) => {

                // Add duration and unique id to item and push to media array
                item.duration = e.target.duration;
                item.id = id;

                // Clean up object urls to avoid memory leaks and remove player
                $('#' + id).remove();
                URL.revokeObjectURL(url);

                // Create media entry in the #media-container
                $('#media-container').append('<div class="media-elements unselectable" id="' + id + '">' + item.name + '</div>');
                $('#drop-files').remove();

                // Append to timeline if media element is double clicked
                $('div#' + id).dblclick((evt) => createClip(evt, item, 0, item.duration));
            })
        }
    };
}


// Create clip in timeline
const createClip = (e, file, in_, out) => {

    // Get timeline element
    const timelineContainer = $('#timeline-container');

    // Create a div element for the clip
    const clip = document.createElement('div');
    clip.innerHTML = file.name;
    clip.file = file;
    clip.className = 'clip unselectable';
    clip.id = 'c' + clipIdCounter;
    clip.in = in_;
    clip.out = out;
    clip.length = () => clip.out - clip.in;
    
    // Append to current clip, normal behaviour if no clips
    if (e.ctrlKey) {
        if (timeline.clips.length == 0) {
            return createClip({ctrlKey : false}, file, in_, out);
         }
        const index = timeline.getClip();    
        $('#c' + index).after(clip);

    // Append at the end
    } else {
        $(timelineContainer).append(clip);
    }

    // Update timeline.clips and some other stuff
    timeline.updateClips([...$('#timeline-container').children()]);

    // Check whether players are loaded correctly;
    player.check(timeline.clips, timeline.getClip(), timeline.time);

    // Load into active player if first clip
    if(timeline.clips.length == 1) {
        $(player.active).on('canplay', () => {
            player.switch(player.active);
            player.draw();
            $(player.active).off('canplay');
        })
    }

    clipIdCounter++;
};


const playheadCallback = () => {

    const clipIndex = timeline.getClip();
    const clip = timeline.clips[clipIndex];

    player.check(timeline.clips, timeline.getClip(), timeline.time);
    player.goTo(timeline.time - clip.timelineIn + clip.in);
}


const play = () => {
    let handle = 0;
    let playing = false;
    

    player.draw();
    let vid = player.active;

    // Pause if end of clip, removes callback. Important.
    if (timeline.time > timeline.totalLength) {
        return play();
    }
    
    const frameCallback = (now, metadata) => {
        if (vid.paused) return;
        
        if (!vid.isLastVideo) {
            
            // Check for inactive to play, play before cut if possible
            if (timeline.time >= vid.playTime - .1) {
                
                const inactive = player.inactive();
                const targetDeviation = inactive.clip.in - (vid.switchTime - timeline.time);
                
                if (!playing) {
                    inactive.play();
                    playing = true;
                    
                    if (vid.playTime != vid.switchTime) {
                        inactive.currentTime = targetDeviation;
                    } else {
                        inactive.currentTime = inactive.clip.in;
                    }
                }
                
                // Sync players, the above does not work because players ...
                // ... take a bit to adjust their currentTime.
                // If we knew framerates we could do much better (this works well for 30fps)
                // Using Exponential to avoid overly severe impact of negative targetDeviation
                // CurrentTime is based on audio, metadata.mediaTime on frames or something
                // We care about syncing up audio, frames are less precise anyway
                inactive.playbackRate = Math.min(Math.max((2 ** 
                    ((targetDeviation - inactive.currentTime) * 10)), .25), 16);
            }
            
            // Check for switch to inactive (actual cut)
            if (timeline.time >= vid.switchTime - .1) {
                playing = false;
                vid.cancelVideoFrameCallback(handle);
                vid = player.switch();
                vid.playbackRate = 1;
                
                // Check inactive if not last clip
                const inactive = player.inactive();
                inactive.pause();
                if (vid.clipIndex + 1 < timeline.clips.length) {
                    player.load(timeline.clips, vid.clipIndex + 1);
                    inactive.currentTime = inactive.clip.in;
                }
            }
        } else if (timeline.time >= timeline.totalLength - .1) {
            player.play('pause');
            vid.cancelVideoFrameCallback(handle);
            return;
        }
        
        timeline.time = vid.clip.timelineIn + vid.currentTime - vid.clip.in;

        
        // Draw frame
        player.draw();
        timeline.draw();
        handle = vid.requestVideoFrameCallback(frameCallback);
    }
    
    // Play, pause and cancel or start callback if needed
    if (!player.play()) {
        vid.cancelVideoFrameCallback(handle);
        return;
    }
    handle = vid.requestVideoFrameCallback(frameCallback);
}


const handleShortCuts = (e) => {

    if (timeline.clips.length == 0) return;
    const clipIndex = timeline.getClip();
    const clip = timeline.clips[clipIndex];

    // Play
    if (e.key ==  " ") {
        e.preventDefault();

        timeline.updateClips([...$('#timeline-container').children()]);
        player.check(timeline.clips, timeline.getClip(), timeline.time);

        // Move inactive player to correct spot
        const inactiveVid = player.inactive();
        if (inactiveVid.clip) {
            inactiveVid.currentTime = inactiveVid.clip.in;
        }
        play();

    // Move to next or previous clip
    } else if (['a', 'd'].includes(e.key)) {
        e.preventDefault();
        const button = e.key == 'a' ? -1 : 1;
        if (!e.metaKey) {

            // Jump to beginning of current clip if 'a' and not already there
            if (timeline.time != clip.timelineIn && button < 0) {
                timeline.time = clip.timelineIn;

            // Move to beginning of next or previous clip
            } else {
                if (clipIndex + button < timeline.clips.length && clipIndex + button >= 0) {
                    timeline.time = timeline.clips[clipIndex + button].timelineIn;
                }
            }

            // Redraw timeline to show playhead movement and check whether players loaded
            timeline.draw();
            player.check(timeline.clips, clipIndex, timeline.time);
        } 

    // Swap clips next to current one with current one
    } else if (['q', 'e'].includes(e.key)) {
        e.preventDefault();
        const button = e.key == 'q' ? -1 : 1;

        // Swap clips in html and then updateClips
        if (clipIndex + button < timeline.clips.length && clipIndex + button >= 0) {
            if (button > 0) {
                $('#c' + (clipIndex + 1)).after($('#c' + clipIndex));
            } else {
                $('#c' + (clipIndex - 1)).before($('#c' + clipIndex));                
            }            
            // Move playhead along and check players loaded correctly
            timeline.time += button * timeline.clips[clipIndex + button].length();
            
            timeline.updateClips([...$('#timeline-container').children()]);
            timeline.draw();
            player.check(timeline.clips, clipIndex, timeline.time);
        }
        
        // Truncate beginning or ending of current clip
    } else if (['A', 'D'].includes(e.key)) {
        e.preventDefault();
        if (e.key == 'A') {
            clip.in = timeline.time - clip.timelineIn + clip.in;
        } else {
            clip.out = timeline.time - clip.timelineIn + clip.in;
        }
        timeline.updateClips([...$('#timeline-container').children()]);
        player.check(timeline.clips, clipIndex, timeline.time);
        
        // Cut clip under playhead
    } else if (e.key == 's') {
        e.preventDefault();
        
        // Pass ctrlKey: true to create after current clip
        createClip({ctrlKey: true},
            clip.file,
            timeline.time - clip.timelineIn + clip.in,
            clip.out);
            
        clip.out =  timeline.time - clip.timelineIn + clip.in;
        timeline.updateClips([...$('#timeline-container').children()]);
        player.check(timeline.clips, clipIndex, timeline.time);
        
        // Delete clip under playhead
    } else if (e.key == 'f') {
        e.preventDefault();
        
        // Delete html and updateClips
        $('#c' + clipIndex).remove();
        timeline.updateClips([...$('#timeline-container').children()]);
        
        // Ensure playhead does not move beyond end of all clips
        // Redraw in case playhead needs to move
        timeline.time = timeline.time < timeline.totalLength 
        ? timeline.time : timeline.totalLength;
        
        timeline.draw();
        player.check(timeline.clips, clipIndex, timeline.time);
    }
}