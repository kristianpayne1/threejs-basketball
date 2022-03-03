import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as dat from 'lil-gui'

let parameters, scene, controls, renderer, camera, gltfLoader, clock;
let mixer, previousTime;

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
    camera.position.z = 3
    scene.add(camera)

    /**
     * Controls
     */
    controls = new OrbitControls(camera, canvas)
    controls.target.set(1, 0, 1)
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

    // Populate scene
    createGUI();
    createLights();
    
    // Let's get things rolling...
    tick();
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
     const ambientLight = new THREE.AmbientLight(parameters.ambientLightColor, parameters.ambientLightIntensity)

     const directionalLight = new THREE.DirectionalLight(parameters.directionalLightColor, parameters.directionalLightIntensity)
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
    };
    
    const gui = new dat.GUI()
    gui.hide()

    /**
     * Key stroke listener
     */
    let showGUI = false;
    window.addEventListener('keydown', (e) => {
        if (e.key == 'c') {
            showGUI ? gui.hide() : gui.show();
            showGUI = !showGUI;
        }
        if (e.key === 'd') {
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

}

/**
 * Animate scene
 */
const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - previousTime
    previousTime = elapsedTime

    if(mixer)
    {
        mixer.update(deltaTime)
    }

    // Update controls
    controls.update()

    // Render
    renderer.render(scene, camera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

// START
init();