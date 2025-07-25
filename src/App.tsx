import * as proj from 'proj-wasm';
import { createSignal, onCleanup, onMount } from 'solid-js';

// const myClone = structuredClone;


export default function Home() {

  const myClone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
  };
  
  // State for proj-wasm initialization
  const [projInitialized, setProjInitialized] = createSignal(false);
  const [context, setContext] = createSignal(null);
  
  // Initialize proj-wasm
  onMount(async () => {
    try {
      await proj.init();
      const ctx = proj.context_create();
      setContext(ctx);
      setProjInitialized(true);
      
      // Calculate coordinate transformations once proj is initialized
      const equalEarth = transformCoordinates('EPSG:4326', equalEarthProjection, latLngGrid);
      const webMercator = transformCoordinates('EPSG:4326', webMercatorProjection, latLngGrid);
      const verticalPerspective = transformCoordinates('EPSG:4326', verticalPerspectiveProjection, latLngGrid);
      
      setEqualEarthCoords(equalEarth);
      setWebMercatorCoords(webMercator);
      setVerticalPerspectiveCoords(verticalPerspective);
      
      setProjectedGrid(myClone(webMercator));
    } catch (error) {
      console.error('Failed to initialize proj-wasm:', error);
    }
  });
  
  function generateLatLngGrid(spacing: number) {
    const points = [];
    for (let lat = -90; lat <= 90; lat += spacing) {
      for (let lng = -180; lng <= 180; lng += spacing) {
        points.push([lng, lat]);
      }
    }
    return points;
  }
  
  enum ProjectionType {
    EqualEarth = 'Equal Earth',
    WebMercator = 'Web Mercator',
    VerticalPerspective = 'Vertical Perspective',
    NaturalEarth = 'Natural Earth',
  }
  
  function clampLat(lat: number): number {
    return Math.max(-85, Math.min(85, lat));
  }

  
  function lerp(a: number, b: number, mix: number): number {
    return a * (1.0 - mix) + b * mix;
  }

  const equalEarthProjection =
    'PROJCS["World_Equal_Earth",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Equal_Earth"],PARAMETER["false_easting",0],PARAMETER["false_northing",0],PARAMETER["longitude_of_center",0],PARAMETER["latitude_of_center",0],UNIT["Meter",1]]';
  const webMercatorProjection =
    'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["Meter",1],AUTHORITY["EPSG","3857"]]';
  const verticalPerspectiveProjection =
    '+proj=geos +lat_0=0 +lon_0=0 +h=35785831 +datum=WGS84 +units=m +no_defs';
  // const naturalEarthProjection = '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs +type=crs'

  const gridSpacing = 10; // degrees
  const latLngGrid = generateLatLngGrid(gridSpacing);

  // Create a signal for the computed coordinates that will be updated after initialization
  const [equalEarthCoords, setEqualEarthCoords] = createSignal<number[][]>([]);
  const [webMercatorCoords, setWebMercatorCoords] = createSignal<number[][]>([]);
  const [verticalPerspectiveCoords, setVerticalPerspectiveCoords] = createSignal<number[][]>([]);

  // Function to transform coordinates using proj-wasm
  const transformCoordinates = (sourceCrs: string, targetCrs: string, coords: number[][]) => {
    if (!projInitialized() || !context()) return [];
    
    try {
      const transformer = proj.proj_create_crs_to_crs({
        context: context(),
        source_crs: sourceCrs,
        target_crs: targetCrs
      });
      
      return coords.map(([lng, lat]) => {
        const coordArray = proj.coord_array(1);
        // For EPSG:4326, use [lat, lng, z, t] format
        proj.set_coords_BANG_(coordArray, [[lat, lng, 0, 0]]);
        
        proj.proj_trans_array({
          p: transformer,
          direction: 1,  // PJ_FWD (forward transformation)
          n: 1,          // number of coordinates
          coord: coordArray.malloc || coordArray.get('malloc')
        });
        
        // Access the transformed coordinates
        const x = coordArray.array[0];  // Easting
        const y = coordArray.array[1];  // Northing
        return [x, y];
      });
    } catch (error) {
      console.error('Transformation error:', error);
      return [];
    }
  };

  const [projectionType, setProjectionType] = createSignal(
    ProjectionType.WebMercator
  );
  const [projectedGrid, setProjectedGrid] = createSignal<number[][]>(
    []
  );
  const [animationFrame, setAnimationFrame] = createSignal<number | undefined>(
    undefined
  );

  const animateProjection = (startGrid: number[][], endGrid: number[][], duration: number) => {
    const startTime = performance.now();
    const animate = (time: number) => {
      const elapsed = time - startTime;
      const mix = Math.min(elapsed / duration, 1);
      setProjectedGrid(
        startGrid.map((startCoords, i) => {
          const [startX, startY] = startCoords;
          const [endX, endY] = endGrid[i];
          return [lerp(startX, endX, mix), lerp(startY, endY, mix)];
        })
      );

      if (mix < 1) {
        setAnimationFrame(requestAnimationFrame(animate));
      }
    };
    setAnimationFrame(requestAnimationFrame(animate));
  };

  const updateProjection = (type: ProjectionType) => {
    if (animationFrame()) {
      cancelAnimationFrame(animationFrame()!);
    }

    setProjectionType(type);
    let endGrid: number[][];
    switch (type) {
      case ProjectionType.WebMercator:
        endGrid = myClone(webMercatorCoords());
        break;
      case ProjectionType.VerticalPerspective:
        endGrid = myClone(verticalPerspectiveCoords());
        break;
      case ProjectionType.EqualEarth:
        endGrid = myClone(equalEarthCoords());
        break;
      default:
        endGrid = myClone(webMercatorCoords());
        break;
    }
    
    if (endGrid.length > 0) {
      animateProjection(myClone(projectedGrid()), myClone(endGrid), 3000);
    }
  };

  onCleanup(() => {
    if (animationFrame()) {
      cancelAnimationFrame(animationFrame()!);
    }
  });

  console.log('Lat/Lng Grid', latLngGrid);
  console.log('EqualEarth Grid', projectedGrid());

  return (
    <main>
      {!projInitialized() ? (
        <p>Initializing proj-wasm...</p>
      ) : (
        <>
          <p>{'Showing ' + projectionType()}</p>

          <a href="https://github.com/birkskyum/proj4js-demo/" target="_blank" rel="noopener noreferrer">
            GitHub Link
          </a><br />
          <br />


          <button onClick={() => updateProjection(ProjectionType.EqualEarth)}>
            Equal Earth
          </button>
          <button onClick={() => updateProjection(ProjectionType.WebMercator)}>
            Web Mercator
          </button>
          <button
            onClick={() => updateProjection(ProjectionType.VerticalPerspective)}
          >
            Vertical Perspective
          </button>
          {/* <button onClick={() => updateProjection(ProjectionType.NaturalEarth)}>
            Natural Earth
          </button> */}

          <br />
          <svg
            width="800"
            height="800"
            viewBox={'-20000000 -10000000 40000000 20000000'}
            style={{ border: '1px solid black' }}
          >
            {projectedGrid().map(([x, y]: number[], index: number) => {
              // if (x == undefined  || y == undefined) {
              //   return <circle cx={x} cy={-y} r="400000" fill="blue" />
              // } else {
              return <circle cx={x} cy={-y} r="200000" fill="red" />;
              // }
            })}
          </svg>
        </>
      )}
    </main>
  );
}
