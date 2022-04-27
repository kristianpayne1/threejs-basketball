import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as dat from 'lil-gui'
import * as CANNON from 'cannon-es'
import CannonDebugger from 'cannon-es-debugger'

let parameters, scene, controls, renderer, camera, clock;
let previousTime, world, directionalLight, ambientLight, objectsToUpdate = [];
let cannonDebugger, objects = {}, raycaster, mouse, isGrabbing, currentIntersect
let gplane, jointBody, mouseConstraint, constrainedBody, sizes;
let bounceSounds, hoopHitSounds, ballModel, textures;

/**
 * Initialise scene
 */
const init = () => {
    scene = new THREE.Scene();
    clock = new THREE.Clock()
    previousTime = 0

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
     * Textures
     */

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
     * Initialise physics
     */
    initialisePhysics();

    /**
     * Debugger
     */
     cannonDebugger = new CannonDebugger(scene, world, {
        onInit(body, mesh) {
            mesh.visible = false;   
            // Toggle visibiliy on "d" press
            document.addEventListener('keydown', (event) => {
            if (event.key === 'd') {
                mesh.visible = !mesh.visible
            }
            })
        },
      })

    loadAssets(() => {
        // Create stuff
        createGUI();
        createLights();
        createObjects();
        createControls(sizes);

        // Let's get things rolling...
        tick();
    });
}

const loadAssets = (callback) => {
    const manager = new THREE.LoadingManager();
    const loadingOverlay = document.querySelector('div.loading-overlay')
    const loadingBar = document.querySelector('div.progress-bar');
    manager.onLoad = () => {
        console.log( 'Loading complete!');
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            callback();
        }, 600)
    };
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
        loadingBar.style.width = `${Math.floor((itemsLoaded / itemsTotal) * 100)}%`
    };
    manager.onError = (url) => {
        console.log( 'There was an error loading ' + url );
    };

    loadModels(manager);
    loadAudioFiles(manager);
    loadTextures(manager);
}

const createObjects = () => {
    objects.floor = createFloor();
    objects.ball = createBall();
    objects.hoop = createHoop();
    objects.walls = createWalls();

    // Joint body
    const shape = new CANNON.Particle();
    jointBody = new CANNON.Body({
        mass: 0
    });
    jointBody.addShape(shape);
    jointBody.collisionFilterGroup = 0;
    jointBody.collisionFilterMask = 0;
    world.addBody(jointBody)
}

const createFloor = () => {
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 10, 200, 100),
        new THREE.MeshStandardMaterial({ color: '#B89979' })
    );
    floor.receiveShadow = true
    floor.rotation.x = - Math.PI * 0.5;

    // Textures
    const { colorMap } = textures.floor;
    colorMap.repeat.x = 6;
    colorMap.repeat.y = 6;
    colorMap.wrapS = THREE.RepeatWrapping;
    colorMap.wrapT = THREE.RepeatWrapping;
    colorMap.rotation = Math.PI * 0.5;
    floor.material.map = colorMap;

    scene.add(floor)

    // Floor physics
    const floorShape = new CANNON.Plane()
    const floorBody = new CANNON.Body()
    floorBody.mass = 0
    floorBody.addShape(floorShape)
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(- 1, 0, 0), Math.PI * 0.5) 
    world.addBody(floorBody)

    return { mesh: floor, body: floorBody };
}

const createBall = () => {
    const mesh = ballModel;
    mesh.castShadow = true
    mesh.scale.set(parameters.radius + 0.05, parameters.radius + 0.05, parameters.radius + 0.05);
    scene.add(mesh)

    bounceSounds.forEach(sound =>  mesh.add(sound))

    const sphereShape = new CANNON.Sphere(parameters.radius)
    const sphereBody = new CANNON.Body({
        mass: 1,
        position: new CANNON.Vec3(0, 1.25, 0),
        shape: sphereShape,
    });
    var quatX = new CANNON.Quaternion();
    var quatY = new CANNON.Quaternion();
    quatX.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI * 0.5);
    quatY.setFromAxisAngle(new CANNON.Vec3(0,0,1), Math.PI * 0.5);
    var quaternion = quatY.mult(quatX);
    sphereBody.quaternion = quaternion
    sphereBody.sleep();
    sphereBody.addEventListener('collide', playBounceSound)
    world.addBody(sphereBody)


    objectsToUpdate.push({ mesh, body: sphereBody });
    return { mesh, body: sphereBody };
}

const createHoop = () => {
    const position = [parameters.hoopPositionX, parameters.hoopPositionY, parameters.hoopPositionZ];
    const mesh = new THREE.Group();

    hoopHitSounds.forEach(sound =>  mesh.add(sound))
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

    const hoopShape = CANNON.Trimesh.createTorus(0.35, 0.025, 16, 100);
    const hoopBody = new CANNON.Body({ mass: 0 });
    hoopBody.position.set(...position);
    hoopBody.addShape(hoopShape, new CANNON.Vec3(0, 0, 0), new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(- 1, 0, 0), Math.PI * 0.5));

    // Backboard
    const { colorMap } = textures.board;
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

    const boardShape = new CANNON.Box(new CANNON.Vec3(1.825 * 0.5, 1.219 * 0.5, 0.03 * 0.5 ))
    hoopBody.addShape(boardShape, new CANNON.Vec3(...boardPosition), new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI * 0.5))

    hoopBody.addEventListener('collide', playHoopHitSound)
    world.addBody(hoopBody);
    scene.add(mesh)

    // objectsToUpdate.push({ mesh: hoop, body: hoopBody })
    return { mesh, body: hoopBody };
}

const createWalls = () => {
    const walls = new THREE.Group();
    const wallsPosRot = [
        { position: new THREE.Vector3(0, 4, 5), rotation: new THREE.Vector3(0, Math.PI, 0) },
        { position: new THREE.Vector3(-10, 4, 0), rotation: new THREE.Vector3(0, Math.PI * 0.5, 0) },
        {position: new THREE.Vector3(0, 4, -5), rotation: new THREE.Vector3(0, 0, 0) }, 
    ];
    
    const geometry = new THREE.PlaneBufferGeometry(20, 10, 200, 100);
    geometry.setAttribute('uv2', new THREE.BufferAttribute(geometry.attributes.uv.array, 2))
    const material = new THREE.MeshStandardMaterial();

    // Textures
    const maps = [];
    const { colorMap, aoMap, normalMap } = textures.wall;
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

    return { mesh: walls, body: null }
}

/**
 * Physics
 */
const initialisePhysics = () => {
    world = new CANNON.World()
    world.gravity.set(0, - 9.82, 0);
    world.broadphase = new CANNON.SAPBroadphase(world)
    world.allowSleep = true
  
    // Default material
    const defaultMaterial = new CANNON.Material('default')
    const defaultContactMaterial = new CANNON.ContactMaterial(
        defaultMaterial,
        defaultMaterial,
        {
            friction: 0.5,
            restitution: 0.7
        }
    )
    world.defaultContactMaterial = defaultContactMaterial
}

/**
 * Load models
 */
const loadModels = (manager) => {
    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.load('basketball/basketball.gltf', (gltf) => {
        ballModel = gltf.scene.children[0].children[0].children[0].children[0]
    })
}

/**
 * Load Textures
 */
const loadTextures = (manager) => {
    const textureLoader = new THREE.TextureLoader(manager);
    // Floor
    const loadFloorTextures = () => {
        const colorMap = textureLoader.load('floor/WoodFlooringMahoganyAfricanSanded001_COL_2K.jpg');
        textures = { ...textures, floor: { colorMap } };
    }
    // Wall
    const loadWallTextures = () => {
        const colorMap = textureLoader.load('wall/BricksPaintedWhite001_COL_2K.jpg');
        const aoMap = textureLoader.load('wall/BricksPaintedWhite001_AO_2K.jpg');
        const normalMap = textureLoader.load('wall/BricksPaintedWhite001_NRM_2K.jpg');
        textures = { ...textures, wall: { colorMap, aoMap, normalMap } };
    }
    // Board
    const loadBoardTextures = () => {
        const colorMap = textureLoader.load('backboard/backboard.png');
        textures = { ...textures, board: { colorMap } };
    }
    // Load
    loadFloorTextures();
    loadWallTextures();
    loadBoardTextures();
}

/**
 *  Audio
 */
const loadAudioFiles = (manager) => {
    const listener = new THREE.AudioListener();
    camera.add( listener );

    const audioLoader = new THREE.AudioLoader(manager);
    bounceSounds = [];
    hoopHitSounds = [];
    // Load bounce sounds
    for (let i = 1; i <= 7; i++) {
        const bounceSound = new THREE.PositionalAudio( listener );
        audioLoader.load(`sfx/bounce${i}.mp3`, ( buffer ) => {
            bounceSound.setBuffer(buffer);
            bounceSound.setRefDistance( 2 );
            bounceSounds.push(bounceSound);
        });
    }
    // Load hoop hit sounds
    for (let i = 1; i <= 3; i++) {
        const hoopHitSound = new THREE.PositionalAudio( listener );
        audioLoader.load(`sfx/hoophit${i}.mp3`, ( buffer ) => {
            hoopHitSound.setBuffer(buffer);
            hoopHitSound.setRefDistance( 1 );
            hoopHitSounds.push(hoopHitSound);
        });
    }
}

let isPlayingBounceSound;
const playBounceSound = (collision) => {
    if (!isPlayingBounceSound) {
        const impactStrength = Math.min(collision.contact.getImpactVelocityAlongNormal(), 10);
        if(impactStrength > 0.5) {
            const hitSound = bounceSounds[Math.floor(Math.random() * bounceSounds.length)];
            hitSound.setVolume(impactStrength / 10);
            hitSound.play();
            isPlayingBounceSound = setTimeout(() => {
                isPlayingBounceSound = false;
            }, hitSound.buffer.duration)
        }
    }
}

let isPlayingHoopHitSound;
const playHoopHitSound = (collision) => {
    if (!isPlayingHoopHitSound) {
        const impactStrength = Math.min(collision.contact.getImpactVelocityAlongNormal(), 10);
        if(impactStrength > 1.5) {
            const hitSound = hoopHitSounds[Math.floor(Math.random() * hoopHitSounds.length)];
            hitSound.setVolume(impactStrength / 10);
            hitSound.play();
            isPlayingHoopHitSound = setTimeout(() => {
                isPlayingHoopHitSound = false;
            },  250)
        }
    }
}
 
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
    if (gplane && mouseConstraint) {
        const pos = projectOntoPlane();
        if (pos.x === undefined || pos.y === undefined || pos.z === undefined) return;
        moveJointToPoint(pos.x, pos.y, pos.z);
    }
}

const onMouseDown = () => {
    const ballBody = objects.ball.body;
    if (currentIntersect && !isGrabbing) {
        document.body.style.cursor = 'grabbing';
        isGrabbing = true;

        const pos = currentIntersect.point;
        if (pos.x === undefined || pos.y === undefined || pos.z === undefined) return;
        pos.x = 0;
        ballBody.angularVelocity = new CANNON.Vec3(0, 0, 0)
        setScreenPerpCenter(pos);
        addMouseConstraint(pos.x, pos.y, pos.z, ballBody);
    }
}

const onMouseUp = () => {
    const ballBody = objects.ball.body;
    if (isGrabbing && currentIntersect) {
        document.body.style.cursor = 'grab';
        const throwDirection = new CANNON.Vec3(ballBody.velocity.x, ballBody.velocity.y, ballBody.velocity.z);
        ballBody.applyImpulse(new CANNON.Vec3(-Math.min(throwDirection.normalize(), 4), 0, 0), new CANNON.Vec3(0, 0, 0))
    } else if (!currentIntersect) {
        document.body.style.cursor = 'default';
    }
    removeJointConstraint();
    isGrabbing = false;
}

const updateControls = () => {
    raycaster.setFromCamera(mouse, camera);

    const ball = objects.ball;
    const intersects = raycaster.intersectObjects([ball.mesh]);

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

const addMouseConstraint = (x, y, z, body) => {
    // The cannon body constrained by the mouse joint
    constrainedBody = body;

    // Move the cannon click marker particle to the click position
    jointBody.position.set(x, y, z);
  
    // Create a new constraint
    // The pivot for the jointBody is zero
    mouseConstraint = new CANNON.PointToPointConstraint(constrainedBody, new CANNON.Vec3(0, 0, 0), jointBody, new CANNON.Vec3(0, 0, 0));
  
    // Add the constriant to world
    world.addConstraint(mouseConstraint);
  }
  
  // This functions moves the transparent joint body to a new postion in space
const moveJointToPoint = (x, y, z) => {
    // Move the joint body to a new position
    jointBody.position.set(x, y, z);
    mouseConstraint.update();
}
  
const removeJointConstraint = () => {
    // Remove constriant from world
    world.removeConstraint(mouseConstraint);
    mouseConstraint = false;
}

const projectOntoPlane = () => {
    // project mouse to that plane
    const hit = raycaster.intersectObjects([gplane])[0];
    if (hit)
      return hit.point;
    return false;
}

/**
 * Animate scene
 */
const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - previousTime
    previousTime = elapsedTime

    // Update physics
    world.step(1 / 60, deltaTime, 3)

    for(const object of objectsToUpdate)
    {
        object.mesh.position.copy(object.body.position)
        object.mesh.quaternion.copy(object.body.quaternion)
    }

    // Update camera controls
    controls.update()

    // Update controls
    updateControls();
    
    // Update the CannonDebugger meshes
    cannonDebugger.update()

    // Render
    renderer.render(scene, camera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

// START
init();