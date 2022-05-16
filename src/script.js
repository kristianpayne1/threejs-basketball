import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as dat from 'lil-gui'
import AssetManager from './asset-manager';

let parameters, scene, controls, renderer, camera, clock;
let directionalLight, ambientLight, objectsToUpdate = [];
let objects = {}, raycaster, mouse, isGrabbing, currentIntersect
let gplane, sizes, sendTime, worker, assetManager;

const timeStep = 1 / 60;

/**
 * Initialise scene
 */
const init = () => {
    scene = new THREE.Scene();
    clock = new THREE.Clock()

    const canvas = document.querySelector('canvas.webgl')

    /**
     * Sizes
     */
    sizes = {
        width: window.innerWidth,
        height: window.innerHeight
    }

    window.addEventListener('resize', () =>
    { 
        // Update sizes
        sizes.width = window.innerWidth
        sizes.height = window.innerHeight

        // Update camera
        camera.aspect = sizes.width / sizes.height
        camera.updateProjectionMatrix()

        // Update renderer
        renderer.setSize(sizes.width, sizes.height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    })

    /**
     * Camera
     */
    camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
    camera.position.set(2, 1., 0)
    scene.add(camera)

    /**
     * Controls
     */
    controls = new OrbitControls(camera, canvas)
    controls.target.set(0, 1.5, 0)
    controls.enableDamping = true
    controls.enabled = false

    /**
     * Renderer
     */
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true
    })
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.physicallyCorrectLights = true;
    renderer.outputEncoding = THREE.sRGBEncoding;

    /**
     * Asset manager
     */
    assetManager = new AssetManager(camera);

    /**
     * Worker
     */
    initialiseWebWorker();

    assetManager.loadAssets(() => {
        // Create stuff
        createGUI();
        createLights();
        createObjects();
        createControls(sizes);

        // Let's get things rolling...
        tick();
        updateWorker();
    });
}

const createObjects = () => {
    objects.floor = createFloor();
    objects.ball = createBall();
    objects.hoop = createHoop();
    objects.walls = createWalls();
}

const createFloor = () => {
    const floor = new THREE.Group();
    const floorGeometry = new THREE.PlaneGeometry(20, 12, 200, 100);

    // Wooden floor
    const woodenFloorMesh = new THREE.Mesh(
        floorGeometry,
        new THREE.MeshStandardMaterial({ color: '#B89979' })
    );
    woodenFloorMesh.receiveShadow = true
    woodenFloorMesh.rotation.x = - Math.PI * 0.5;

    // Textures
    const { floor: floorTextures, markings: markingsTextures } = assetManager.textures;
    const { colorMap } =floorTextures;
    colorMap.repeat.x = 6;
    colorMap.repeat.y = 6;
    colorMap.wrapS = THREE.RepeatWrapping;
    colorMap.wrapT = THREE.RepeatWrapping;
    colorMap.rotation = Math.PI * 0.5;
    woodenFloorMesh.material.map = colorMap;

    floor.add(woodenFloorMesh);

    // Markings
    const markingsMesh = new THREE.Mesh(
        floorGeometry,
        new THREE.MeshStandardMaterial({
            transparent: true,
        })
    );
    markingsMesh.receiveShadow = true
    markingsMesh.rotation.x = - Math.PI * 0.5;
    markingsMesh.position.y = 0.01;

    // Textures
    const { colorMap: markingsColorMap } = markingsTextures;
    markingsColorMap.transparent= true;
    markingsColorMap.repeat.x = 1;
    markingsColorMap.repeat.y = 1;
    markingsColorMap.wrapS = THREE.RepeatWrapping;
    markingsColorMap.wrapT = THREE.RepeatWrapping;
    markingsMesh.material.map = markingsColorMap;

    floor.add(markingsMesh);

    scene.add(floor);

    worker.postMessage({
        type: "CREATE_FLOOR",
        payload: { }
    });

    return floor;
}

const createBall = () => {
    const position = [0, 1.25, 0];
    const radius = parameters.radius;

    const { ball: ballModel } = assetManager.models;
    const mesh = ballModel;
    mesh.castShadow = true
    mesh.scale.set(radius + 0.05, radius + 0.05, radius + 0.05);
    mesh.userData.bodyID = objectsToUpdate.length;
    scene.add(mesh)

    addBounceSoundsToMesh(mesh);

    worker.postMessage({
        type: "CREATE_BALL",
        payload: {
            position,
            radius
        }
    });

    objectsToUpdate.push(mesh);
    return mesh;
}

const createHoop = () => {
    const position = [parameters.hoopPositionX, parameters.hoopPositionY, parameters.hoopPositionZ];
    const mesh = new THREE.Group();

    addHitHoopSoundsToMesh(mesh)

    // Hoop
    const hoop = new THREE.Mesh( new THREE.TorusGeometry( 0.35, 0.025, 16, 100 ), new THREE.MeshStandardMaterial({
        metalness: 0.7,
        roughness: 0.3,
        color: new THREE.Color('#db3746').convertSRGBToLinear()
    }));
    hoop.castShadow = true;
    hoop.rotation.x += Math.PI * 0.5
    hoop.position.set(...position);
    mesh.add( hoop );

    // Backboard
    const { board: boardTextures } = assetManager.textures;
    const { colorMap } = boardTextures;
    const boardPosition = [-0.40, 0.36, 0];
    const mat1 = new THREE.MeshBasicMaterial({color: 0xffffff});
    const mat2 = new THREE.MeshBasicMaterial({color: 0xffffff});
    const mat3 = new THREE.MeshBasicMaterial({color: 0xffffff});
    const mat4 = new THREE.MeshBasicMaterial({color: 0xffffff});
    const mat5 = new THREE.MeshStandardMaterial({color: 0xffffff, map: colorMap, metalness: 0.3, roughness: 0.1});
    const mat6 = new THREE.MeshBasicMaterial({color: 0xffffff});
    const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.825, 1.219, 0.03),
        [
            mat1,
            mat2,
            mat3,
            mat4,
            mat5,
            mat6,
        ]
    )
    board.position.set(position[0] + boardPosition[0], position[1] + boardPosition[1], position[2] + boardPosition[2]);
    board.receiveShadow = true
    board.castShadow = true
    board.rotation.y = Math.PI * 0.5
    mesh.add(board)

    worker.postMessage({
        type: "CREATE_HOOP",
        payload: {
            position,
            boardPosition,
        }
    });

    scene.add(mesh)

    // objectsToUpdate.push({ mesh: hoop, body: hoopBody })
    return mesh;
}

const createWalls = () => {
    const walls = new THREE.Group();
    const wallsPosRot = [
        { position: new THREE.Vector3(0, 4, 6), rotation: new THREE.Vector3(0, Math.PI, 0) },
        { position: new THREE.Vector3(-10, 4, 0), rotation: new THREE.Vector3(0, Math.PI * 0.5, 0) },
        { position: new THREE.Vector3(0, 4, -6), rotation: new THREE.Vector3(0, 0, 0) }, 
    ];
    
    const geometry = new THREE.PlaneBufferGeometry(20, 10, 200, 100);
    geometry.setAttribute('uv2', new THREE.BufferAttribute(geometry.attributes.uv.array, 2))
    const material = new THREE.MeshStandardMaterial();

    // Textures
    const { wall: wallTextures } = assetManager.textures;
    const maps = [];
    const { colorMap, aoMap, normalMap } = wallTextures;
    material.map = colorMap;
    maps.push(colorMap);

    material.aoMap = aoMap;
    material.aoMapIntensity = 1;
    maps.push(aoMap);

    material.normalMap = normalMap;
    material.normalScale.set(0.75, 0.75)
    maps.push(normalMap);
   
    maps.forEach(map => {
        map.repeat.x = 5;
        map.repeat.y = 3;
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
    })
    
    for(let i = 0; i < 3; i++) {
        const wall = new THREE.Mesh(
            geometry,
            material
        );
        const { position, rotation } = wallsPosRot[i]
        wall.position.copy(position);
        wall.rotateY(rotation.y)
        wall.receiveShadow = true;
        wall.castShadow = true;

        walls.add(wall);
    }

    scene.add(walls);

    return walls;
}

/**
 * Physics web worker
 */
const initialiseWebWorker = () => {
    worker = new Worker(new URL('./worker.js', import.meta.url));

    worker.addEventListener('message', event => {
        const { type, payload } = event.data;

        switch (type) {
            case "UPDATE": {
                update(payload);
                break;
            }
            case "PLAY_SOUND": {
                playSound(payload);
                break;
            }
            default: {
                console.warn("Recieved unknown message type " + type);
            }
        }
    })
}

// update objects in scene
const update = (data) => {
    const { positions, quaternions } = data;

        // check if we have correct data
        if ((positions.length / 3) !== objectsToUpdate.length) return console.error('Incorrect positions data');
        if ((quaternions.length / 4) !== objectsToUpdate.length) return console.error('Incorrect quaternions data');

        // Update the three.js meshes
        for (let i = 0; i < objectsToUpdate.length; i++) {
            objectsToUpdate[i].position.set(positions[i * 3 + 0], positions[i * 3 + 1], positions[i * 3 + 2]);
            objectsToUpdate[i].quaternion.set(
              quaternions[i * 4 + 0],
              quaternions[i * 4 + 1],
              quaternions[i * 4 + 2],
              quaternions[i * 4 + 3]
            );
        }

        // Delay the next step by the amount of timeStep remaining,
        // otherwise run it immediatly
        const delay = timeStep * 1000 - (performance.now() - sendTime);
        setTimeout(updateWorker, Math.max(delay, 0));
}

const updateWorker = () => {
    sendTime = performance.now();

    worker.postMessage({
        type: "UPDATE",
    });
};
 
/** 
 * Lights
*/
const createLights = () => {
    ambientLight = new THREE.AmbientLight(parameters.ambientLightColor, parameters.ambientLightIntensity)

    directionalLight = new THREE.DirectionalLight(parameters.directionalLightColor, parameters.directionalLightIntensity)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.set(1024, 1024)
    directionalLight.shadow.camera.far = 15
    directionalLight.shadow.camera.left = - 7
    directionalLight.shadow.camera.top = 7
    directionalLight.shadow.camera.right = 7
    directionalLight.shadow.camera.bottom = - 7
    directionalLight.position.set(parameters.directionalLightX, parameters.directionalLightY, parameters.directionalLightZ)

    scene.add(directionalLight)
    scene.add(ambientLight)
}

/**
 * Create GUI
 */
const createGUI = () => {
    parameters = {
        ambientLightColor: 0xffffff,
        ambientLightIntensity: 1.5,
        directionalLightColor: 0xffffff,
        directionalLightIntensity: 4,
        directionalLightX: 4,
        directionalLightY: 4.5,
        directionalLightZ: 0.5,
        directionalLightRotX: 0,
        directionalLightRotY: 0,
        directionalLightRotZ: 0,
        radius: 0.24,
        hoopPositionX: -2.5,
        hoopPositionY: 3,
        hoopPositionZ: 0,
    };
    
    const gui = new dat.GUI()
    gui.hide()

    /**
     * Key stroke listener
     */
    let showGUI = false;
    window.addEventListener('keydown', (e) => {
        if (e.key == 'x') {
            showGUI ? gui.hide() : gui.show();
            showGUI = !showGUI;
        }
        if (e.key === 'c') {
            controls.enabled = !controls.enabled
        }
    })

    const lightsFolder = gui.addFolder('Lights')

    lightsFolder.addColor(parameters, "ambientLightColor").onChange(() => ambientLight.color.set(parameters.ambientLightColor))
    lightsFolder.add(parameters, "ambientLightIntensity", 0, 10, 0.1).onChange(() => ambientLight.intensity = parameters.ambientLightIntensity)
    lightsFolder.addColor(parameters, "directionalLightColor").onChange(() => directionalLight.color.set(parameters.directionalLightColor))
    lightsFolder.add(parameters, "directionalLightIntensity", 0, 10, 0.1).onChange(() => directionalLight.intensity = parameters.directionalLightIntensity)
    lightsFolder.add(parameters, "directionalLightX", -100, 100, 1).onChange(() => directionalLight.position.set(parameters.directionalLightX, parameters.directionalLightY, parameters.directionalLightZ))
    lightsFolder.add(parameters, "directionalLightY", -100, 100, 1).onChange(() => directionalLight.position.set(parameters.directionalLightX, parameters.directionalLightY, parameters.directionalLightZ))
    lightsFolder.add(parameters, "directionalLightZ", -100, 100, 1).onChange(() => directionalLight.position.set(parameters.directionalLightX, parameters.directionalLightY, parameters.directionalLightZ))
    lightsFolder.add(parameters, "directionalLightRotX", - Math.PI, Math.PI, 0.1).onChange(() => directionalLight.rotation.set(parameters.directionalLightRotX, parameters.directionalLightRotY, parameters.directionalLightRotZ))
    lightsFolder.add(parameters, "directionalLightRotY", - Math.PI, Math.PI, 0.1).onChange(() => directionalLight.rotation.set(parameters.directionalLightRotX, parameters.directionalLightRotY, parameters.directionalLightRotZ))
    lightsFolder.add(parameters, "directionalLightRotZ", - Math.PI, Math.PI, 0.1).onChange(() => directionalLight.rotation.set(parameters.directionalLightRotX, parameters.directionalLightRotY, parameters.directionalLightRotZ))

    const objectFolder = gui.addFolder('Objects')

    objectFolder.add(parameters, 'radius', 0.1, 1, 0.1).onChange(() => { 
        const ball = objects.ball;
        console.log(ball)
        ball.mesh.scale.set(parameters.radius, parameters.radius, parameters.radius);
        ball.body.shapes[0].radius = parameters.radius;
    })
    const updateHoopPosition = (axis, value) => {
        const hoop = objects.hoop;
        hoop.mesh.position[axis] = value;
        hoop.body.position[axis] = value;

    }
    objectFolder.add(parameters, 'hoopPositionX', -10, 10, 0.1).onChange(() => updateHoopPosition('x', parameters.hoopPositionX))
    objectFolder.add(parameters, 'hoopPositionY', -10, 10, 0.1).onChange(() => updateHoopPosition('y', parameters.hoopPositionY))
    objectFolder.add(parameters, 'hoopPositionZ', -10, 10, 0.1).onChange(() => updateHoopPosition('z', parameters.hoopPositionZ))
}

/**
 * Controls
 */
const createControls = () => {
    mouse = new THREE.Vector2();
    raycaster = new THREE.Raycaster();

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown, false)
    window.addEventListener('mouseup', onMouseUp, false)
}

const onMouseMove = (event) => {
    mouse.x = event.clientX / sizes.width * 2 - 1;
    mouse.y = - (event.clientY / sizes.height) * 2 + 1;
    if (gplane && isGrabbing) {
        const pos = projectOntoPlane();
        if (pos.x === undefined || pos.y === undefined || pos.z === undefined) return;
        moveJointToPoint(pos.x, pos.y, pos.z);
    }
}

const onMouseDown = () => {
    if (currentIntersect && !isGrabbing) {
        const { bodyID } = currentIntersect.object.userData;
        document.body.style.cursor = 'grabbing';
        isGrabbing = true;

        const pos = currentIntersect.point;
        if (pos.x === undefined || pos.y === undefined || pos.z === undefined) return;
        pos.x = 0;
        setScreenPerpCenter(pos);
        addMouseConstraint(pos.x, pos.y, pos.z, bodyID);
    }
}

const onMouseUp = () => {
    if (isGrabbing && currentIntersect) {
        document.body.style.cursor = 'grab';
        throwObject();
    } else if (!currentIntersect) {
        document.body.style.cursor = 'default';
    }
    removeJointConstraint();
    isGrabbing = false;
}

const updateControls = () => {
    raycaster.setFromCamera(mouse, camera);

    const ball = objects.ball;
    const intersects = raycaster.intersectObjects([ball]);

    if (intersects.length > 0) {
        if (!currentIntersect)
        {
            document.body.style.cursor = 'grab';
        }
        currentIntersect = intersects[0];
    } else if(!isGrabbing) {
        if (currentIntersect)
        {
            document.body.style.cursor = 'default';
        }
        currentIntersect = null;
    }
}

// This function creates a virtual movement plane for the mouseJoint to move in
const setScreenPerpCenter = (point) => {
    // If it does not exist, create a new one
    if (!gplane) {
      const planeGeo = new THREE.PlaneGeometry(100, 100);
      const plane = gplane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
        color: 0x777777
      }));
      plane.visible = false; // Hide it..
      scene.add(gplane);
    }
  
    // Center at mouse position
    gplane.position.copy(point);
  
    // Make it face toward the camera
    gplane.quaternion.copy(camera.quaternion);
}

// Tell worker to add mouse contraint
const addMouseConstraint = (x, y, z, bodyID) => {
    worker.postMessage({
        type: "ADD_MOUSE_CONTRAINT",
        payload: {
            x,
            y,
            z,
            bodyID
        }
    });
}
  
// Tell worker to move the joint
const moveJointToPoint = (x, y, z) => {
    worker.postMessage({
        type: "MOVE_JOINT",
        payload: {
            x,
            y,
            z,
        }
    });
}

// Tell worker to remove joint
const removeJointConstraint = () => {
    worker.postMessage({
        type: "REMOVE_JOINT",
    });
}

const projectOntoPlane = () => {
    // project mouse to that plane
    const hit = raycaster.intersectObjects([gplane])[0];
    if (hit)
      return hit.point;
    return false;
}

const throwObject = () => {
    worker.postMessage({
        type: "THROW",
    });
}

/**
 * Audio
 */
const playSound = (data) => {
    const { sound, impactVelocity } = data;
    switch (sound) {
        case "BOUNCE": {
            playBounceSound(impactVelocity);
            break;
        }
        case "HOOP_HIT": {
            playHoopHitSound(impactVelocity);
            break;
        }
    }
}

let isPlayingBounceSound;
const playBounceSound = impactVelocity => {
    if (!isPlayingBounceSound) {
        const impactStrength = Math.min(impactVelocity, 10);
        if(impactStrength > 0.5) {
            const { bounceSounds } = assetManager.sounds;
            const hitSound = bounceSounds[Math.floor(Math.random() * bounceSounds.length)];
            hitSound.setVolume(impactStrength / 10);
            hitSound.play();
            isPlayingBounceSound = setTimeout(() => {
                isPlayingBounceSound = false;
            }, 250)
        }
    }
}

const addBounceSoundsToMesh = mesh => assetManager.sounds.bounceSounds.forEach(sound =>  mesh.add(sound));

let isPlayingHoopHitSound;
const playHoopHitSound = impactVelocity => {
    if (!isPlayingHoopHitSound) {
        const impactStrength = Math.min(impactVelocity, 10);
        if(impactStrength > 1.5) {
            const { hoopHitSounds } = assetManager.sounds;
            const hitSound = hoopHitSounds[Math.floor(Math.random() * hoopHitSounds.length)];
            hitSound.setVolume(impactStrength / 10);
            hitSound.play();
            isPlayingHoopHitSound = setTimeout(() => {
                isPlayingHoopHitSound = false;
            },  250)
        }
    }
}

const addHitHoopSoundsToMesh = mesh => assetManager.sounds.hoopHitSounds.forEach(sound => mesh.add(sound))

/**
 * Animate scene
 */
const tick = () =>
{
    // Update camera controls
    controls.update()

    // Update controls
    updateControls();
    
    // Update the CannonDebugger meshes
    // cannonDebugger.update()

    // Render
    renderer.render(scene, camera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

// START
init();