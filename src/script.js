import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as dat from 'lil-gui'
import * as CANNON from 'cannon-es'
import CannonDebugger from 'cannon-es-debugger'

let parameters, scene, controls, renderer, camera, gltfLoader, clock;
let previousTime, world, directionalLight, ambientLight, objectsToUpdate;
let cannonDebugger, objects, raycaster, mouse, isHovering, isGrabbing, currentIntersect

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
    const sizes = {
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
    camera.position.set(2.5, 1., 0)
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

    // Create stuff
    createGUI();
    createLights();
    createObjects();
    createControls(sizes);
    
    // Let's get things rolling...
    tick();
}

const createObjects = () => {
    objectsToUpdate = [];
    objects = {};

    objects.floor = createFloor();
    objects.ball = createBall();
    objects.hoop = createHoop();
}

const createFloor = () => {
    // Floor
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 10),
        new THREE.MeshStandardMaterial({
            color: '#777777',
            metalness: 0.3,
            roughness: 0.4,
        })
    )
    floor.receiveShadow = true
    floor.rotation.x = - Math.PI * 0.5
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
     const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 20), new THREE.MeshStandardMaterial({
        metalness: 0,
        roughness: 0.7,
         color: '#6E260E'
    }))
    mesh.castShadow = true
    mesh.scale.set(parameters.radius, parameters.radius, parameters.radius)
    scene.add(mesh)

    const sphereShape = new CANNON.Sphere(parameters.radius)
    const sphereBody = new CANNON.Body({
        mass: 1,
        position: new CANNON.Vec3(0.1, 3, 0),
        shape: sphereShape,
    });

    world.addBody(sphereBody)

    objectsToUpdate.push({ mesh, body: sphereBody });

    return { mesh, body: sphereBody };
}

const createHoop = () => {
    const position = [parameters.hoopPositionX, parameters.hoopPositionY, parameters.hoopPositionZ];
    const mesh = new THREE.Group();
    // Hoop
    const hoop = new THREE.Mesh( new THREE.TorusGeometry( 0.305, 0.025, 16, 100 ), new THREE.MeshStandardMaterial({
        metalness: 0.7,
        roughness: 0.3,
        color: '#ff0000'
    }));
    hoop.castShadow = true;
    hoop.rotation.x += Math.PI * 0.5
    hoop.position.set(...position);
    mesh.add( hoop );

    const hoopShape = CANNON.Trimesh.createTorus(0.305, 0.025, 16, 100);
    const hoopBody = new CANNON.Body({ mass: 0 });
    hoopBody.position.set(...position);
    hoopBody.addShape(hoopShape, new CANNON.Vec3(0, 0, 0), new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(- 1, 0, 0), Math.PI * 0.5));

    // Backboard
    const boardPosition = [-0.32, 0.23, 0];
    const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.825, 1.219, 0.03),
        new THREE.MeshStandardMaterial({
            color: '#ffffff',
            metalness: 0.5,
            roughness: 0.3,
        })
    )
    board.position.set(position[0] + boardPosition[0], position[1] + boardPosition[1], position[2] + boardPosition[2]);
    board.receiveShadow = true
    board.castShadow = true
    board.rotation.y = Math.PI * 0.5
    mesh.add(board)

    const boardShape = new CANNON.Box(new CANNON.Vec3(1.825 * 0.5, 1.219 * 0.5, 0.03 * 0.5 ))
    hoopBody.addShape(boardShape, new CANNON.Vec3(...boardPosition), new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI * 0.5))

    world.addBody(hoopBody);
    scene.add(mesh)

    // objectsToUpdate.push({ mesh: hoop, body: hoopBody })
    return { mesh, body: hoopBody };
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
            restitution: 0.8
        }
    )
    world.defaultContactMaterial = defaultContactMaterial
}

/**
 * Load models
 */
const loadModels = () => {
    gltfLoader = new GLTFLoader()
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
        ambientLightIntensity: 2,
        directionalLightColor: 0xffffff,
        directionalLightIntensity: 4,
        directionalLightX: 5,
        directionalLightY: 5,
        directionalLightZ: 5,
        directionalLightRotX: 0,
        directionalLightRotY: 0,
        directionalLightRotZ: 0,
        radius: 0.24,
        hoopPositionX: -3,
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
const createControls = (sizes) => {
    mouse = new THREE.Vector2();
    raycaster = new THREE.Raycaster();

    window.addEventListener('mousemove', (event) =>
    {
        mouse.x = event.clientX / sizes.width * 2 - 1
        mouse.y = - (event.clientY / sizes.height) * 2 + 1
    })

    window.addEventListener('mousedown', () => {
        if (isHovering && !isGrabbing) {
            document.body.style.cursor = 'grabbing';
            isGrabbing = true;
        }
    }, false)

    window.addEventListener('mouseup', () => {
        if (isGrabbing && isHovering) {
            document.body.style.cursor = 'grab';
        } else if (!isHovering) {
            document.body.style.cursor = 'default';
        }
        isGrabbing = false;
    }, false)
}

const updateControls = () => {
    raycaster.setFromCamera(mouse, camera);

    const ball = objects.ball;
    const intersects = raycaster.intersectObjects([ball.mesh]);

    if (intersects.length > 0) {
        if (!currentIntersect)
        {
            document.body.style.cursor = 'grab';
            isHovering = true;
        } else if (isGrabbing) {
            updateBallPosition([mouse.x, mouse.y, 0]);
        }
        currentIntersect = ball;
    } else {
        if (currentIntersect)
        {
            document.body.style.cursor = 'default';
            isHovering = false;
        }
        currentIntersect = null;
    }
}

const updateBallPosition = (targetPosition) => {

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