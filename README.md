# **Distinctiveness and Complexity**

Distinctiveness: We have not done a video editor. On the backend, this project is very light, but the user setup was always done for us so doing it myself was different from usual. Using AJAX requests was also never required. I do always have to generate a new token on the server and remember it in JS for the next POST request.

Complexity: I do utilize one Django model and I do use JavaScript on the frontend. The app is mobile responsive (it resizes) but due to relying heavily on hotkeys, is not mobile-friendly. Given the complexity of this project, I hope this is acceptable. (~800 lines of JS and it is by far the most complex project I have ever worked on).

I could have added comments or something to make the user model less irrelevant but I have done that before in this course and I don't see the point. The original plan was to save a bunch of information about the state of the edit and allow the user to just drop in the same files and have the editor rebuild itself to its original state. This project was so complex that I decided that I will just hope I can get away without it. The user model does exist and technically that should fulfill the requirements.

# **How to run**

Run "python3 manage.py makemigrations" maybe you need to specify the app after ("editor" or "video_editor") then "python3 manage.py migrate".

Now just run "python3 manage.py runserver" ("python" without "3" in windows). There is a requirements.txt with the django version I used.

Does not work on Firefox, only works with videos supported by the HTML player.

Example video for testing: [Pixabay](https://pixabay.com/videos/robin-bird-forest-nature-spring-21723/). This was tested to work (mp4, Chrome). Download the file and drag and drop into the media pool.

# **Overview**

Other than the usual boilerplate, all files are in "/editor".

- Backend:
  - "models.py" contains only a user model:
  - "views.py" contains a way for a user to sign up and register. Both are designed to use AJAX requests so that I can use a CSRF-token while also handling all requests in JavaScript. This allows me to minimize reloads. Which currently reset the edit.

- Frontend:
  - Html templates in "/templates/editor":
    - "layout.html" links to bootstrap, jQuery, my JavaScript and my CSS. It also contains the navbar.
    - "index.html" contains three pages, they are managed by JS to avoid reloading. Look at the div id's for the route. The "/register" div is also used for "/login".
  - CSS in "/static/editor":
    - Do not use the CSS file, the SCSS file will be more readable. It contains all the styling except the width and height of the timeline canvas which has to be done in JS.
  - Javascript in "/static/editor"
    - "timeline.js" contains an object that handles the timeline, it provides a time value that corresponds to a position in the div, position on the canvas and a clip with corresponding timestamp for a particular video. It is the most complex component of the app. It also handles drawing all the timestamps and playhead in the timeline.
    - "player.js" contains an object that handles the canvas that is used to display the video. During cuts, the canvas is switched from representing one video player to representing another. This makes the cut as smooth as possible.
    - "index.js" contains the code for all the sites. At the beginning, we check the route and display the appropriate html. We also call a function that corresponds to the particular site.
      - "/instructions" needs no js
      - "/register" and "/login" use the same function that makes an AJAX request to the backend
      - "/editor" is where we use the player and timeline objects to create the editor functionality such as dropping files into the media pool, adding them to the timeline and cutting them. It also handles the `requestVideoFrameCallback()` that allows you to play your edit back.

This project was tested on **Chrome**. It should work on all common browsers **except Firefox** (since it does not support requestvideoFrameCallback). **There is also no way for you to render your file** out after you are done editing since ffmpegs WASM implementation wanted me to use an npm server and I wasn't sure how to make that work with Django and the project was complex enough as is. The app won't look that great on wide aspect ratios. There is no undo, redo.

# **Walkthrough**

I will now try to give an overview over all the parts of the editor. The other sites are pretty self explanatory.

### **Media Pool**
In the "editor" function (index.js), we call a dropHandler if any items are dropped into the media pool. Here we iterate through all the items asynchronously (getting the files from disk may be slow): We check that the file is a video and if it is, we load an html video element and as soon as it has loaded the metadata, we get the duration of the file and immidiately remove the player.

Now we just append a div with the file name written in it and place an event listener that will create a clip if double-clicked.

### **Creating a clip**
In the createClip function we add a bunch of properties to a div object. We need to know where the clip starts (within the video in the media pool) and where it ends (*in the file*). In the timeline object (updateClips), we add some more properties such as where the clips start *in the timeline* and an index that tells us where it is in comparison to other clips.

Now we just append a div into the timeline and make sure the players and timeline are loaded correctly. To further understand this, let us first look at the timeline object.

## **Timeline Object**

### **timeline.initialize( *Callable* )

    Arg: Callback that gets called whenever the user repositions the playhead manually. May be null.

This object is defined in "editor/static/editor/timeline.js". To understand what it does, we can first look at the properties defined in the timeline.initialize method.

    this.clips = [];
    this.totalLength = 0;
    this.time = 0;
    this.offset = 0;
    this.zoom = 1;

- First, there is a list of clips that are just the divs representing clips in the timeline. More information on the clips are in the "Additional Information" section.
- Then we have the total length of the timeline in seconds
- Time: Current time of where the playhead is in the timeline (seconds)
- Offset: How many seconds are to the left of the div containing our clips (horizontal scroll).
- Zoom: `1px == 1` second at `zoom == 1`, the zoom gets multiplied with the pixel value (`zoom == 2 -> 2px == 1s`). **To convert a *seconds* value to *pixels on the timeline*: Just multiply with this.zoom, to convert the other way around: Divide by this.zoom!** This is the basis of the timeline.

In this app you will find cases where we access how many seconds we are into the timeline, how many pixels we are into the timeline *and* how many seconds we are into a file. It is always important to know which one you are looking at to avoid mixing them together without converting into same type first.

Below this, we declare a couple of methods and add a couple of event listeners which all (in the end) call the "draw" method which does all the heavy lifting by painting the time markers and playhead onto the canvas using only the variables provided above.

If we want to handle zoom or scroll, we just need to modify the properties and call **draw()**.

### **timeline.draw()**

First we get the viewport dimensions and resize the canvas appropriately using its html attributes and not CSS which would only distort the image and ruin our pixel <-> seconds relationship. We use this relationship to match the canvas to the divs which represent the clips to the user. We do account for mobile users by using a slightly different width.

First, the easy part: We need to draw a playhead that represents where the user is in the edit.

To know where the **playhead** needs to be drawn (in pixels), we take how many seconds we are into the clip and subtract how many seconds our screen is moved to the right. This gives us how many seconds we are from the left of the screen. Now we multiply with the zoom to convert this to a pixel value `(zoom == pixels/seconds; seconds * (pixels / seconds) == pixels)`.

    const playHeadPosition = (this.time - this.offset) * this.zoom;

Drawing the **time markers** is much harder: We do not want to iterate over the entire timeline every time we redraw (we redraw a lot when playing a video to show playhead movement for example). We only want to iterate over the visible bit.

We will iterate through a for loop and every iteration, we move to the right some amount. To know how to do this, we first set some values:

We set how many seconds the markers should be spaced apart.

    const timeMarkerFrequency = 5;

We set how many pixels we need to move by converting that value to pixels (same as in the playhead secion above).

    const move = this.zoom * timeMarkerFrequency;

Since we are not necessarily scrolling to the right in 5 second steps, we need to offset where we start drawing in the first place (`lineX`). To do this, we check how many pixels we are to the right and take the modulo with respect to how many pixels the time markers are apart. The modulo is just a way getting this to behave periodicly with respect to the time marker frequency (everytime we reach a new line, we start over).

    let lineX = - (this.offset * this.zoom) % 
                  (timeMarkerFrequency * this.zoom);

On every minute marker, we draw a bigger line. We need to know how many iterations from the start the first big line should start. We take how far we are away from the next full minute (in seconds) and devide by the time marker frequency to know how many short lines need to come before the first big one.

    const bigLineOffset = Math.floor((this.offset % 60) 
                            / timeMarkerFrequency);

With our `timeMarkerFrequency` they should always be 12 lines apart after the initial offset.

    const bigLineFrequency = Math.floor(60 / timeMarkerFrequency);

Everytime we scroll with the scrollbar, move the playhead or zoom, we need to redraw for those changes to be represented. We also need to modify the size of the divs to increase or decrease in size if we are zooming.

### **timeline.updateClips( *JS-array* )**

    Arg: [...$('#timeline-container').children()]

Requires `clip.in`, `clip.out` and `clip.length()` to be set on all clips. Check "Additional Information" section for more. Keeps `timeline.clips` chronological.

This function takes the divs representing clips and uses the properties we defined earlier (index.js -> createClip) to determine where every clip should start in the timeline, updates the width of the div if the clip changed in size and updates an index telling us where it is with respect to the other clips and updates the id.

At the end it updates the totalLength of all clips in the timeline together and it updates the clips array. Whenever we change the clips in any way, we will probably call this to make sure everything is up to date.

### **timeline.getClip()**

This function determines on which clip you are returning an index such that `timeline.clips[index]` is the clip that the playhead is currently on.

### **timeline.handleZoom( *jQuery-event* )**

    Arg: A scroll event with deltaY.

I feel like it isn't the best idea to do the event listeners in the object (timeline.initialize) but it's too late now. I feel like it should have been just a layer for abstraction.

We double or half the zoom (large zoom number -> you are zoomed in more) depending on the direction you scroll in and ensure you don't zoom too far in any direction.

First we want to change our offset so that the playhead is in the middle of the screen: For this we use the playhead position in pixels (see playhead section in draw()) and say it should be equal to half the width of the canvas. Now we just solve for this.offset and we know, what it needs to be.

    newOffset = (this.time - this.canvas.width / (2 * this.zoom));

We will need to match this to the behaviour of the html scrollbar which will not exist if there aren't long enough clips in the timeline. We need the pixel value for the total length of all the clips. This can just be gotten by multiplying `this.totalLength * this.zoom`, if the clips are less long than the containers width (same as timeline canvas), we need to have no offset since there is no html scrollbar.

    this.totalLength * this.zoom < this.canvas.width ?

The scrollbar will also not scoll further left or right, if there are no more divs there. This means if the playhead is at the beginning or end of the edit, we need to prevent the canvas from offsetting further right or left. This would lead to a confusing difference between divs representing clips and playhead position.

    this.offset = Math.max(0, newOffset);
    $('#timeline-container').scrollLeft(this.offset * this.zoom);

First we cap the offset at 0 and tell the scrollbar how many pixels to the right our wanted offset is. Since it won't let us go too far right, we just check whether `this.offset` in pixels is higher than the pixel offset of the scrollbar. We use that to cap the scroll on the right. Converting the scrollLeft pixel value to seconds can be done by dividing with the zoom `pixels / (pixels / seconds)` <-> `seconds`.

    // Cap offset on the right
    if (this.offset * this.zoom > $('#timeline-container').scrollLeft()) {
        this.offset = $('#timeline-container').scrollLeft() / this.zoom;
    }

Now we still need to tell the timeline that we just scrolled, this is important since **we have an event listener watching scoll movements** which would otherwise try to adjust the canvas to represent the scroll.

After updating the properties, we redraw.

### **timeline.updatePlayheadPos( *jQuery-event* )**

    Arg: A mousedown event

After getting the pixel value for where you clicked and making sure you didn't click too low (without this check, clicking on the scrollbar would move the playhead), we check that you did not position further right than the end of the clips.

We turn the x-mouse position into seconds by dividing with zoom and add the offset to account for the seconds not visible on screen. This gives us how many seconds you clicked into the edit. If you are further into it than `this.totalLength`, we know you are past the end.

    this.time = this.offset + (x / this.zoom) <= this.totalLength ?
                this.offset + (x / this.zoom) :
                (this.totalLength - this.offset);

If there are clips in the timeline, call the callback function provided as arg in timeline.initialize.

### **timeline eventListeners**

Most of the event listeners just call functions I already described.

We redraw if the div containing the clips is resized. Else the canvas does not get resized as well which would lead to a mismatch between divs representing clips and playhead.

    $(window).resize(() => this.draw())

We still need to handle scrolling horizontally: When we zoom, we often move the scrollbar, this will call this event listener which will then find `this.justZoomed == true` and set it back to false. If we did not zoom, this value will still be false and we need to convert our pixel offset to seconds before writing it into `this.offset`. This ensures divs and time markers scroll congruently.

    const scroll = $('#timeline-container').scrollLeft();
    this.offset = scroll / this.zoom;

## **Player Object**

To smoothly cut between two clips, we utilize a canvas and two hidden html players. During the cut we simply switch which player is thrown onto the canvas and which player is muted.

As we are moving through the timeline, we need to make sure the players always load the correct file and move to the correct spot. If you want to know more about additional properties available on the html players, go to "Additional Information".

### **player.initialize()**

Here, we get get all the html elements we need to access

    this.v1 = document.getElementById('v1'); // Video element 1
    this.v2 = document.getElementById('v2'); // Video element 1
    this.canvas = document.getElementById('canvas'); // Canvas for videos
    this.ctx = this.canvas.getContext('2d');
    this.width = 1280;
    this.height = 720;

Then we store which player is active, this will always have to be up to date.

    this.active = this.v1;

### **player.load( *clips, clipIndex, video* )**

    clips: timeline.clips (must be up to date); Array
    clipIndex: Index of clip you want to load; Number, timeline.getClip()
    video: HTML player you want to load that clip into ; HTML element or null

If no video element is provided this assumes you want to load in the player that is not active.

First we update the source of the html player. On Safari, this can apparently be done by feeding the Blob (file) directly into the player. Since I couldn't test that, it is not implemented.

We revoke an old object url if it exists and then replace it with a new one for the file we want to load. If we keep forgetting to revoke, there can be a memory leak (fixes itself on reload, though).

    video.src && URL.revokeObjectURL(video.src);
    video.src = URL.createObjectURL(clip.file);

Then we call an updateStuff function:

### **player.updateStuff( *clips, clipIndex, video* )**

    clips: timeline.clips (must be up to date); Array
    clipIndex: Index of clip you want to load; Number, timeline.getClip()
    video: HTML player you want to load that clip into; HTML element not null

While we are playing, we will have to grab each frame of the player and draw it onto the canvas. The function we use to do that (not this one) will run every frame. To avoid expensive operations, we attach a bunch of stuff that we might find interesting directly to the player:

We attach the file id (`clip.file.id`) and the `clip` itselft, we attach which clip is loaded as an index on `timeline.clips`.

We also attach whether this is the last clip and, when to switch to the other player (with respect to timeline, `clip.out` would be with respect to video).

    video.switchTime = clip.timelineIn + clip.length();

If it is not the last clip, we attach when to start playing the next clip in the background (muted) on the inactive player. If there isn't at least .5 seconds of space in the next file before the cut (`clip.in`), we do not play the video in the background and `switchTime` and `playTime` will be equal.

    video.playTime = clips[clipIndex + 1].in > .5 ? 
                      video.switchTime - .5 : video.switchTime;

### **player.goTo( *time, video* )**

    time: Time into the edit from the beginning (timeline.time); Number

This function moves to a point in time and draws the frame from the `this.active` player there.

### **player.draw()**

Draw current frame of `player.active` onto canvas.

### **player.switch( *video* )**

    video: Video player that should be switched to; HTML element or null

If no video is provided, it defaults to showing inactive player. Not providing video is basically the same as `switch(this.inactive())`.

We switch, which player is muted and reference the active player into `player.active`. We return the active player.

### **player.inactive()**

Return inactive player (HTML element).

### **player.play( *instruction* )**

    instruction: String ('play' || 'pause') or null

If no instruction is provided: Plays if video paused and the other way around. Else follows instruction. Always applies to active player.

For inactive player use `player.inactive().play()` and `.pause()`.

Returns whether player is playing.

### **player.check( *clips, clipIndex* )**

    clips: timeline.clips; Array
    clipIndex: Index of current clip; Number, timeline.getClip()

This function checks, whether both players are loaded correctly. It gets called a lot, when you reposition your playhead manually.

By the end of this function, the `player.active` needs to have loaded the current clip and `player.inactive()` needs to have loaded the next one. This would allow us to cut between the two when you play. *May switch active and inactive players.*

If the current clip is not loaded in the active player, check whether it is loaded in the inactive one, if so: `this.switch`.

If not loaded at all, load in active player. Now check inactive player loaded if not last clip.

    this.load(clips, clipIndex, this.active);

    // Check inactive if not last clip
    if (this.inactive().clipIndex != clipIndex + 1) {
        clips.length > clipIndex + 1 && this.load(clips, clipIndex + 1);
    }

Then we call `this.updateStuff` on current and next clip (if available) to ensure we have all data we need to start playback.

## **Additional info**

### **timeline.clips**

With all this, we can summarize what will be available on each clip if set up correctly:

    // Provided upon creation of clip outside of "timeline.js", 
    // .id is updated in this.updateClips().
    clip.in: Starting point of clip in the file; Number of seconds
    clip.out: End point of clip in file; Number of seconds
    clip.length(): Subtract above to return difference -> Number of seconds
    clip.id: Id of div, ("c" + clipIndex); String
    clip.file: file that is used in this clip; Blob
        file.duration: Length of file != clip.length(); Number of seconds
        file.id: Unique id of file; String ("f" + index)

    // Provided by using methods in player and timeline
    clip.clipIndex: Which clip is it in timeline.clips; Number
    clip.timelineIn: Starting point of the clip in the timeline; Number seconds

***If `timeline.updateClips()` is used correctly, the array should always have the same order as the clips as represented by divs in the timeline to the user.***

### **player.active**

Both players, if used correctly, will also have a bunch of stuff attached to them:

    v.clipIndex: Index of the clip loaded in v (of timeline.clips)
    v.clip: clip element from above
    v.switchTime: Time where one needs to switch to next player != clip.out
    v.playTime: Time where next player needs to start playing in background
    v.isLastVideo: Whether last clip; Bool

## **Back to index.js**

Now that we have looked at the objects, we can start implementing our player in index.js. Let's go back to createClip first. I will only bother explaining a couple of things here since there are a lot of similar pieces.

### **createClip()**

As mentioned earlier, we attached the correct properties to a div that we created. If ctrl was pressed, when this is called, it appends the clip behind the current clip, else it goes at the end.

To append behind current clip, we get the clip index `timeline.getClip()` and use that the divs representing clips always have an id of `"c" + clipIndex` to select the clip to append after.

        const index = timeline.getClip();    
        $('#c' + index).after(clip);

Then we use `timeline.updateclips`  to make sure timeline.clips and all its elements are up to date.

Now we `player.check()` so that players are loaded correctly.

### **playheadCallback()**

This function was passed into `timeline.initialize()` and will be called back everytime the user repositions the playhead (includes click and drag, called on `'mousemove'` then).

Since the user may have moved to another clip, we need to `player.check()` that the players are loaded correctly before telling the active player to `player.goTo()` to the correct time.

    player.check(timeline.clips, timeline.getClip());

The timeline object provides us with a `timeline.time` value that that tells us how far we are into the edit (seconds). First we subtract the `clip.timelineIn` value to find out how many seconds we are from the beginning of the clip. Then we offset by `clip.in` to account for clips not starting at the beginning of the respective file. This gives how far we are into the file, which is what the video element needs in `video.currentTime` (done by `player.goTo()`).
    
    player.goTo(timeline.time - clip.timelineIn + clip.in);

### **play()**

This function is called from handleShortcuts() after checking that players loaded correctly and setting the inactive player to its `videoElement.clip.in` time (might not matter).

This function takes care of some stuff before calling `player.play()` and initiating the frame callback:

- We store the active player in `vid`
- We initilize a handle in this scope to cancel the frame callback later. If this is not working correctly, moving the playhead manually will update the `currentTime` of the player which will trigger the frame callback which will then move the playhead. The user will no longer be in control of the playhead.
- Store a playing variable that easily lets us check whether the `player.inactive()` is playing. Could have used `.paused` but getting the inactive player everytime might be costly.

After defining the frame callback, we call `player.play()` and if we paused the video by doing that, we immediately cancel the callback and return.

Else we call `requestVideoFrameCallback()` on the active player and pass our frame callback as an argument. This will call our callback everytime the videoplayer has a new frame.

**frameCallback()**
- Check that we are not paused, else return
- Check whether we are in last clip. If not:
  - Check If we have reached `vid.playTime`, we subtract a small value because the player never actually reaches the end of the file. Maybe `file.duration` the way we obtained it in `createClip()` does not start counting at zero, but we effectively did by setting `clip.in` to 0 by default. If yes:
    - Here, we need to synchronize the player as best as possible: The inactive player needs to be in front of its `clip.in` point in the file so that as it reaches the time of the cut `vid.switchTime`, all we need to do is switch the players that are rendered to the screen. For this we calculate the `targetDeviation`: It grabs how far the active player is away from its `switchTime` and subtracts this off the inactive players in-point.

          targetDeviation = inactive.clip.in - (vid.switchTime - timeline.time);

    - If the inactive player is not already playing we start playing.
    - Unfortunately the players take some amount of time to start with that which requires that we do additional work to sync everything: We calculate `targetDeviation` every frame after `vid.playTime` and subtract the inactive players `.currentTime` to check how far we are away from sync.

            diff = targetDeviation - inactive.currentTime

    - Now we need a way to project this value onto `.playbackRate` such that the player will try minimize the `targetDeviation`. Without knowing the framerate there was not that much of a point with getting super mathematical so I just relied on a combination of guessing and experimenting while printing out values to see how well it worked. An exponential does make sense though. As far as I know the player only wants rates between .25 and 16 or 0, we also check for this.

            .playbackRate = Math.min(Math.max((2 ** 
                            (diff * 10)), .25), 16);

    - When we reach the cut `.switchTime`, we switch players and cancel the videoFrameCallback on `vid`, now we switch active players and reassign `vid`. Then we load the next file in the other, now inactive player.

            player.load(timeline.clips, vid.clipIndex + 1);

- Every frame we need to update `timeline.time` so that we can redraw our timeline. First take how many seconds we are into the timeline at the beginning of the clip in the player `.timelineIn` and add the time we are into the file `metadata.mediaTime` (similar to `vid.currentTime` but based on frames (former) instead of audio (latter), does not matter for our purposes since cuts won't be frame accurate anyway). Now we subtract how much time is skipped at the beginnign of the file `.clip.in`.

            timeline.time = vid.clip.timelineIn 
                          + metadata.mediaTime - vid.clip.in;

- After having updated `timeline.time` we can call `timeline.draw()` to show the movement of the playhead.
- Calling `player.draw()` just draws the current frame of the active player `"vid"` onto the canvas. If we didn't have cuts and timelines, the framecallback could consist of only this.
- At the end we make sure we get called back, when there is a new frame by passing `frameCallback` into the `.requestVideoFrameCallback`. If we switched between two players on that frame, `vid` will have been updated to represent the active player and this and the drawing onto the canvas will still work.

### **handleShortcuts()**

This function takes a keydown event and performs a bunch of changes accordingly. I can't really be bothered explaining it more but if you are looking for examples of using the `timeline` and `player` objects it might be worth looking at.

##  **Missing Stuff**

- There is no way to remove media from the pool
- There is no ctrl + Z, couly be done in `timeline.updateClips()`
- There is no way to render out clip, data could be gotten by iterating through `timeline.clips` and getting the `ele.in`, `ele.out` and `ele.file.name`. Then I could make all the segments and concatenate them or something. Since you can't have empty space in the editor.