$(document).ready(
  function() {
    width = document.getElementById('container').offsetWidth;
    height = width / 2;

    setup(width, height);
  }
);

// We should wrap this with an onload, and move all the
// scripting up into the head
d3.select(window).on("resize", throttle);

var zoom = d3.behavior.zoom()
    .scaleExtent([1, 9])
    .on("zoom", move);

var month_map = {
  'Jan': 1,
  'Feb': 2,
  'Mar': 3,
  'Apr': 4,
  'May': 5,
  'Jun': 6,
  'Jul': 7,
  'Aug': 8,
  'Sep': 9,
  'Oct': 10,
  'Nov': 11,
  'Dec': 12
};

var launch_data = {};// [year][month][day]=> [array of entries]
loadLaunchData();

var launch_sites = [];// Stores launch sites
loadLaunchSites();

var current_launches = []; // Stores current launches to display

var width = 0;
var height = 0;

var topo,projection,path,svg,g;

var tooltip;

function setup(width,height){
  tooltip = d3.select("#container").append("div").attr("class", "tooltip hidden");

  projection = d3.geo.mercator()
    .translate([(width/2), (height/1.4)])
    .scale( width / 2 / Math.PI);

  path = d3.geo.path().projection(projection);

  svg = d3.select("#container").append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("id", "map")
      .call(zoom)
      .on("click", click)
      .append("g");

  // TODO: figure out filters
  var defs = svg.append("defs");

  var filter = defs.append("filter")
                   .attr("id", "glow");

  filter.append("feGaussianBlur")
        .attr("in", "SourceGraphic")
        .attr("stdDeviation", 10);

  // Set background color
  svg.append("rect")
     .attr("width", "100%")
     .attr("height", "100%")
     .attr("fill", "#1A181D");

  g = svg.append("g");
}

d3.json("data/world-topo-min.json", function(error, world) {
  var countries = topojson.feature(world, world.objects.countries).features;
  topo = countries;
  drawMap(topo);
  drawLaunchSites();
  drawLaunchEvents();
});

function drawMap(topo) {
  var country = g.selectAll(".country").data(topo);

  // Add countries
  country.enter().insert("path")
      .attr("class", "country")
      .attr("d", path)
      .attr("id", function(d,i) { return d.id; })
      .attr("title", function(d,i) { return d.properties.name; })
      .style("fill", "#606060");
}

function drawLaunchSites()
{
  // Add launch sites
  var site;
  for(var i=0;i<launch_sites.length;i++) {
    site = launch_sites[i];
    addpoint(site.Longitude, site.Latitude, site.FullName, 'launch_site');
  }
}

function drawLaunchEvents()
{
  // Could remove old launches here
  var info;
  for(var i=0;i<current_launches.length;i++) {
    info = current_launches[i].info;
    cls = (info.Success == 'S') ? 'launch_success' : 'launch_failure';
    addpoint(info.Longitude, info.Latitude, info["Launch Vehicle"], cls);
  }
}      

function redraw() {
  width = document.getElementById('container').offsetWidth;
  height = width / 2;
  d3.select('svg').remove();
  setup(width,height);
  drawMap(topo);
  drawLaunchSites();
  drawLaunchEvents();
}

function redrawLaunchesOnly()
{
  // Remove map points
  d3.selectAll("g[class='gpoint']").remove();

  // Redraw launch sites
  drawLaunchSites();

  // Redraw launch events
  drawLaunchEvents();
}

function move() {
  var t = d3.event.translate;
  var s = d3.event.scale; 
  zscale = s;
  var h = height/4;

  t[0] = Math.min(
    (width/height)  * (s - 1), 
    Math.max( width * (1 - s), t[0] )
  );

  t[1] = Math.min(
    h * (s - 1) + h * s, 
    Math.max(height  * (1 - s) - h * s, t[1])
  );

  zoom.translate(t);
  g.attr("transform", "translate(" + t + ")scale(" + s + ")");
}

var throttleTimer;
function throttle() {
  window.clearTimeout(throttleTimer);
    throttleTimer = window.setTimeout(function() {
      redraw();
    }, 200);
}

//geo translation on mouse click in map
function click() {
  var latlon = projection.invert(d3.mouse(this));
  // console.log(latlon);
}

// add points and text to the map
function addpoint(lat,lon,text,cls) {
  //offsets for tooltips
  var offsetL = document.getElementById('container').offsetLeft+20;
  var offsetT = document.getElementById('container').offsetTop+10;

  var gpoint = g.append("g").attr("class", "gpoint");
  var x = projection([lat,lon])[0];
  var y = projection([lat,lon])[1];

  gpoint.append("svg:circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("class","point " + cls)
        .attr("r", 3);

  gpoint
    .on("mousemove", function(d,i) {
      var mouse = d3.mouse(svg.node()).map( function(d) { return parseInt(d); } );

      tooltip.classed("hidden", false)
             .attr("style", "left:"+(mouse[0]+offsetL)+"px;top:"+(mouse[1]+offsetT)+"px")
             .html(text);

      })
      .on("mouseout",  function(d,i) {
        tooltip.classed("hidden", true);
      }); 
}

var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var initialvalues = [1957.7, 2015.2];
d3.select('#slider')
  .style("width", width + "px")
  .style("margin", "0px auto")
  .call(d3.slider()
    .axis(true)
    .min(initialvalues[0])
    .max(initialvalues[1])
    .value(initialvalues)
    .on("slide", updateSliderValues));

updateSliderValues(null, initialvalues);

// Play-related variables
var currentPlayPoint = initialvalues[0];
var currentPlayLimit = initialvalues[1];
var isPlaying = false;
var playTickRepeatTimeout;

// value = [ mindate, maxdate ] in decimal form
function updateSliderValues(evt, value) {
  // Cut all playback and update values for next play request
  clearTimeout(playTickRepeatTimeout);
  isPlaying = false;
  currentPlayPoint = value[0];
  currentPlayLimit = value[1];

  var mindate = convertDecimalDate(value[0]);
  var maxdate = convertDecimalDate(value[1]);
  d3.select("#slidermin").text(months[mindate.getMonth()] + " " + mindate.getFullYear());
  d3.select("#slidermax").text(months[maxdate.getMonth()] + " " + maxdate.getFullYear());
}

function leapYear(year) {
  return ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
};

function convertDecimalDate(decimalDate) {
  var year = parseInt(decimalDate);
  var remainder = decimalDate - year;
  var daysPerYear = leapYear(year) ? 366 : 365;
  var milliseconds = remainder * daysPerYear * 24 * 60 * 60 * 1000;
  var yearDate = new Date(year, 0, 1);
  return new Date(yearDate.getTime() + milliseconds);
}

// This loads the launch data from 'massive_launchlog' into
// a data structure mapped by 'year'=>'month'=>'day'=>array of entries
// Stored in `launch_data`
function loadLaunchData() {
  d3.csv("data/massive_launchlog.csv", function(err, entries) {
    entries.forEach(function(entry) {
      var date_parts = entry["Launch Date and Time (UTC)"].split(" ");
      var year = date_parts[0] * 1;
      var month = month_map[date_parts[1]];
      var day = date_parts[2];

      // Ensure data structure is set up
      if(launch_data[year] == null) {
        launch_data[year] = {};
      }

      if(launch_data[year][month] == null) {
        launch_data[year][month] = {};
      }

      if(launch_data[year][month][day] == null) {
        launch_data[year][month][day] = [];
      }

      launch_data[year][month][day].push(entry);
    });
  });

}

// Loads launch site data from csv, storing entries in `launch_sites`
function loadLaunchSites() {
  d3.csv("data/launch_sites.csv", function(err, sites) {
    sites.forEach(function(i){
      launch_sites.push(i);
    });
  });
}

// Adds points for the launches of a given day to the display
// list, after clearing the previous display
function displayDate(year, month, day) {
  var entries = [];

  if(launch_data[year] && launch_data[year][month] && launch_data[year][month][day]) {
    entries = launch_data[year][month][day];
  }

  // Right now this clears the points completely
  // Later we may change it to not clear, and just allow
  // the animation to continue
  current_launches = [];

  for(var i=0;i<entries.length;i++) {
    current_launches.push(
      {
        birthtime: (new Date()).getTime(),
        info: entries[i]
      }
    );
  }

  redrawLaunchesOnly();
}

// Starts playing a sequence of launches at a specified interval
function play(interval)
{
  // Default value of 10 ms if not specified
  interval = typeof interval !== 'undefined' ? interval : 10;      

  isPlaying = true;
  playTick(interval);
}

// Plays the sequence of all launches starting at the left slider position
// and ending at the right slider position. This function will loop
// indefinitely, until the right slider position is reached
function playTick(interval)
{
  // Stop playing if we're at the right slider position
  if (currentPlayPoint >= currentPlayLimit)
  {
    isPlaying = false;
  }

  if (isPlaying)
  {
    // Increment date
    currentPlayPoint += 1.0 / 365.25;
    var currentDate = convertDecimalDate(currentPlayPoint);

    // Update displayed launches
    displayDate(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

    // This function will be called again in {interval} ms
    playTickRepeatTimeout = setTimeout(playTick, interval, interval);
  }
}