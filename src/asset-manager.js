import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export default class {
    constructor(camera) {
        this.camera = camera;
        this.sounds = {
            bounceSounds: [],
            hoopHitSounds: [],
        };
        this.models = {};
        this.textures = {};
    }

    loadAssets = (callback) => {
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
    
        this.loadModels(manager);
        this.loadAudioFiles(manager);
        this.loadTextures(manager);
    }

    
    /**
     * Models
     */
    loadModels = manager => {
        const gltfLoader = new GLTFLoader(manager);
        gltfLoader.load('basketball/basketball.gltf', (gltf) => {
            const ballModel = gltf.scene.children[0].children[0].children[0].children[0];
            this.models.ball = ballModel;
        })
    }

    /**
     * Textures
     */
    loadTextures = manager => {
        const textureLoader = new THREE.TextureLoader(manager);
        // Floor
        const loadFloorTextures = () => {
            const colorMap = textureLoader.load('floor/WoodFlooringMahoganyAfricanSanded001_COL_2K.jpg');
            this.textures.floor = { colorMap };
        }
        // Markings
        const loadMarkingsTexture = () => {
            const colorMap = textureLoader.load('floor/basketball-markings.png');
            this.textures.markings = { colorMap };
        }
        // Wall
        const loadWallTextures = () => {
            const colorMap = textureLoader.load('wall/BricksPaintedWhite001_COL_2K.jpg');
            const aoMap = textureLoader.load('wall/BricksPaintedWhite001_AO_2K.jpg');
            const normalMap = textureLoader.load('wall/BricksPaintedWhite001_NRM_2K.jpg');
            this.textures.wall = { colorMap, aoMap, normalMap };
        }
        // Board
        const loadBoardTextures = () => {
            const colorMap = textureLoader.load('backboard/backboard.png');
            this.textures.board = { colorMap };
        }
        // Load
        loadFloorTextures();
        loadMarkingsTexture();
        loadWallTextures();
        loadBoardTextures();
    }

    /**
     *  Audio
     */
    loadAudioFiles = manager => {
        const listener = new THREE.AudioListener();
        this.camera.add( listener );

        const audioLoader = new THREE.AudioLoader(manager);
        // Load bounce sounds
        for (let i = 1; i <= 7; i++) {
            const bounceSound = new THREE.PositionalAudio( listener );
            audioLoader.load(`sfx/bounce${i}.mp3`, ( buffer ) => {
                bounceSound.setBuffer(buffer);
                bounceSound.setRefDistance( 2 );
                this.sounds.bounceSounds.push(bounceSound);
            });
        }
        // Load hoop hit sounds
        for (let i = 1; i <= 3; i++) {
            const hoopHitSound = new THREE.PositionalAudio( listener );
            audioLoader.load(`sfx/hoophit${i}.mp3`, ( buffer ) => {
                hoopHitSound.setBuffer(buffer);
                hoopHitSound.setRefDistance( 1 );
                this.sounds.hoopHitSounds.push(hoopHitSound);
            });
        }
    }
}