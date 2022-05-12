import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

let bounceSounds, hoopHitSounds, models = {}, textures = {}
export const loadAssets = (camera, callback) => {
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
    loadAudioFiles(camera, manager);
    loadTextures(manager);
}

/**
 * Models
 */
const loadModels = manager => {
    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.load('basketball/basketball.gltf', (gltf) => {
        const ballModel = gltf.scene.children[0].children[0].children[0].children[0];
        models.ball = ballModel;
    })
}

export const getModels = () => models;

/**
 * Textures
 */
const loadTextures = manager => {
    const textureLoader = new THREE.TextureLoader(manager);
    // Floor
    const loadFloorTextures = () => {
        const colorMap = textureLoader.load('floor/WoodFlooringMahoganyAfricanSanded001_COL_2K.jpg');
        textures.floor = { colorMap };
    }
    // Markings
    const loadMarkingsTexture = () => {
        const colorMap = textureLoader.load('floor/basketball-markings.png');
        textures.markings = { colorMap };
    }
    // Wall
    const loadWallTextures = () => {
        const colorMap = textureLoader.load('wall/BricksPaintedWhite001_COL_2K.jpg');
        const aoMap = textureLoader.load('wall/BricksPaintedWhite001_AO_2K.jpg');
        const normalMap = textureLoader.load('wall/BricksPaintedWhite001_NRM_2K.jpg');
        textures.wall = { colorMap, aoMap, normalMap };
    }
    // Board
    const loadBoardTextures = () => {
        const colorMap = textureLoader.load('backboard/backboard.png');
        textures.board = { colorMap };
    }
    // Load
    loadFloorTextures();
    loadMarkingsTexture();
    loadWallTextures();
    loadBoardTextures();
}

export const getTextures = () => textures;

/**
 *  Audio
 */
const loadAudioFiles = (camera, manager) => {
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
export const playBounceSound = collision => {
    if (!isPlayingBounceSound) {
        const impactStrength = Math.min(collision.contact.getImpactVelocityAlongNormal(), 10);
        if(impactStrength > 0.5) {
            console.log(bounceSounds)
            const hitSound = bounceSounds[Math.floor(Math.random() * bounceSounds.length)];
            hitSound.setVolume(impactStrength / 10);
            hitSound.play();
            isPlayingBounceSound = setTimeout(() => {
                isPlayingBounceSound = false;
            }, hitSound.buffer.duration)
        }
    }
}

export const addBounceSoundsToMesh = mesh => bounceSounds.forEach(sound =>  mesh.add(sound));

let isPlayingHoopHitSound;
export const playHoopHitSound = collision => {
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

export const addHitHoopSoundsToMesh = mesh => hoopHitSounds.forEach(sound => mesh.add(sound))