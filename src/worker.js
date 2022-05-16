import * as CANNON from 'cannon-es'

const timeStep = 1 / 60;
const world = new CANNON.World();
world.gravity.set(0, - 9.82, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

// Default material
const defaultMaterial = new CANNON.Material('default');
const defaultContactMaterial = new CANNON.ContactMaterial(
    defaultMaterial,
    defaultMaterial,
    {
        friction: 0.5,
        restitution: 0.7
    }
);
world.defaultContactMaterial = defaultContactMaterial;

// Update world
const update = () => {
    let positions = new Float32Array(bodies.length * 3);
    let quaternions = new Float32Array(bodies.length * 4);

    // Step the world
    world.fixedStep(timeStep);

    // Copy the cannon.js data into the buffers
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];

        positions[i * 3 + 0] = body.position.x;
        positions[i * 3 + 1] = body.position.y;
        positions[i * 3 + 2] = body.position.z;
        quaternions[i * 4 + 0] = body.quaternion.x;
        quaternions[i * 4 + 1] = body.quaternion.y;
        quaternions[i * 4 + 2] = body.quaternion.z;
        quaternions[i * 4 + 3] = body.quaternion.w;
    }

    // Send data back to the main thread
    self.postMessage(
        {
            type: 'UPDATE',
            payload: {
                positions,
                quaternions,
            }
        },
        // Specify that we want actually transfer the memory, not copy it over. This is faster.
        [positions.buffer, quaternions.buffer]
    );
}


// Objects
let bodies = [];
const addBody = (body, update) => {
    world.addBody(body);

    if (update) bodies.push(body);
}

const createHoop = ({ position, boardPosition }) => {
    const hoopShape = CANNON.Trimesh.createTorus(0.35, 0.025, 16, 75);
    const hoopBody = new CANNON.Body({ mass: 0 });
    hoopBody.position.set(...position);
    hoopBody.addShape(hoopShape, new CANNON.Vec3(0, 0, 0), new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(- 1, 0, 0), Math.PI * 0.5));

    const boardShape = new CANNON.Box(new CANNON.Vec3(1.825 * 0.5, 1.219 * 0.5, 0.03 * 0.5 ))
    hoopBody.addShape(boardShape, new CANNON.Vec3(...boardPosition), new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI * 0.5))

    hoopBody.addEventListener('collide', collision => self.postMessage(
        {
            type: 'PLAY_SOUND',
            payload: {
                sound: "HOOP_HIT",
                impactVelocity: collision.contact.getImpactVelocityAlongNormal()
            }
        },
    ));

    addBody(hoopBody);
}

const createBall = ({ radius, position }) => {
    const sphereShape = new CANNON.Sphere(radius);
    const sphereBody = new CANNON.Body({
        mass: 1,
        position: new CANNON.Vec3(...position),
        shape: sphereShape,
    });

    // Rotate the ball so it faces the way we want
    var quatX = new CANNON.Quaternion();
    var quatY = new CANNON.Quaternion();
    quatX.setFromAxisAngle(new CANNON.Vec3(1,0,0), Math.PI * 0.5);
    quatY.setFromAxisAngle(new CANNON.Vec3(0,0,1), Math.PI * 0.5);
    var quaternion = quatY.mult(quatX);
    sphereBody.quaternion = quaternion;

    sphereBody.sleep();
    sphereBody.addEventListener('collide', collision => self.postMessage(
        {
            type: 'PLAY_SOUND',
            payload: {
                sound: "BOUNCE",
                impactVelocity: collision.contact.getImpactVelocityAlongNormal()
            }
        },
    ));

    addBody(sphereBody, true);
}

const createFloor = () => {
    const floorShape = new CANNON.Plane()
    const floorBody = new CANNON.Body()
    floorBody.mass = 0
    floorBody.addShape(floorShape)
    floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(- 1, 0, 0), Math.PI * 0.5) 

    addBody(floorBody);
}

// Controls
const shape = new CANNON.Particle();
const jointBody = new CANNON.Body({
    mass: 0
});
jointBody.addShape(shape);
jointBody.collisionFilterGroup = 0;
jointBody.collisionFilterMask = 0;
world.addBody(jointBody);

let mouseConstraint, constrainedBody;
const addMouseConstraint = ({ x, y, z, bodyID }) => {
    // The cannon body constrained by the mouse joint
    constrainedBody = bodies[bodyID];

    // Freeze body rotation
    constrainedBody.angularVelocity = new CANNON.Vec3(0, 0, 0)

    // Move the cannon click marker particle to the click position
    jointBody.position.set(x, y, z);
  
    // Create a new constraint
    // The pivot for the jointBody is zero
    mouseConstraint = new CANNON.PointToPointConstraint(constrainedBody, new CANNON.Vec3(0, 0, 0), jointBody, new CANNON.Vec3(0, 0, 0));

    // Add the constriant to world
    world.addConstraint(mouseConstraint);
}

// This functions moves the transparent joint body to a new postion in space
const moveJointToPoint = ({ x, y, z }) => {
    // Move the joint body to a new position
    jointBody.position.set(x, y, z);
    mouseConstraint.update();
}

// Remove the joint
const removeJointConstraint = () => {
    // Remove constriant from world
    world.removeConstraint(mouseConstraint);
    mouseConstraint = false;
}

// YEET!
const throwBody = () => {
    const throwDirection = new CANNON.Vec3(constrainedBody.velocity.x, constrainedBody.velocity.y, constrainedBody.velocity.z);
    constrainedBody.applyImpulse(new CANNON.Vec3(-Math.min(throwDirection.normalize(), 4), 0, 0), new CANNON.Vec3(0, 0, 0))
}

self.addEventListener('message', (event) => {
    const { type, payload } = event.data;
    
    switch(type) {
        case "CREATE_HOOP": {
            createHoop(payload);
            break;
        }
        case "CREATE_BALL": {
            createBall(payload);
            break;
        }
        case "CREATE_FLOOR": {
            createFloor(payload);
            break;
        }
        case "UPDATE": {
            update();
            break;
        }
        case "ADD_MOUSE_CONTRAINT": {
            addMouseConstraint(payload)
            break;
        }
        case "MOVE_JOINT": {
            moveJointToPoint(payload);
            break;
        }
        case "REMOVE_JOINT": {
            removeJointConstraint();
            break;
        }
        case "THROW": {
            throwBody();
            break;
        }
        default: console.error("Invalid type: " + type);
    }
})