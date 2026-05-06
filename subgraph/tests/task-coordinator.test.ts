import {
  assert,
  describe,
  test,
  clearStore,
  newMockEvent,
  beforeEach,
} from "matchstick-as/assembly";
import {
  Address,
  BigInt,
  Bytes,
  ethereum,
  crypto,
} from "@graphprotocol/graph-ts";

import {
  handleTaskCreated,
  handleTaskClaimed,
} from "../src/handlers/task-coordinator";
import {
  TaskCreated,
  TaskClaimed,
} from "../generated/TaskCoordinator/TaskCoordinator";

import { handleMetadataSet } from "../src/handlers/identity";
import { MetadataSet } from "../generated/IdentityRegistry/IdentityRegistry";

// ────────────────────────────────────────────────────────────────────────────
// Constants used across tests
// ────────────────────────────────────────────────────────────────────────────
const CREATOR_HEX = "0x1234567890123456789012345678901234567890";
const OPERATOR_HEX = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const MANIFEST_DIGEST_HEX =
  "0xabababababababababababababababababababababababababababababababab";
const TASK_CID_DIGEST_HEX =
  "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd";
const METADATA_PAYLOAD_HEX =
  "0xefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef";
const TX_HASH_HEX =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function buildTaskCreatedEvent(
  taskId: BigInt,
  creator: Address,
  manifestDigest: Bytes,
  taskCidDigest: Bytes,
): TaskCreated {
  let event = changetype<TaskCreated>(newMockEvent());
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(
    new ethereum.EventParam("taskId", ethereum.Value.fromUnsignedBigInt(taskId)),
  );
  event.parameters.push(
    new ethereum.EventParam("creator", ethereum.Value.fromAddress(creator)),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "manifestDigest",
      ethereum.Value.fromFixedBytes(manifestDigest),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "taskCidDigest",
      ethereum.Value.fromFixedBytes(taskCidDigest),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "maxClaims",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(3)),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "requiredVerdicts",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1)),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "claimWindowStart",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1700000000)),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "claimWindowEnd",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1700003600)),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "submissionDeadline",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1700007200)),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "evaluationDeadline",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1700010800)),
    ),
  );
  return event;
}

function buildTaskClaimedEvent(
  taskId: BigInt,
  attemptIndex: BigInt,
  operator: Address,
  claimExpiresAt: BigInt,
): TaskClaimed {
  let event = changetype<TaskClaimed>(newMockEvent());
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(
    new ethereum.EventParam("taskId", ethereum.Value.fromUnsignedBigInt(taskId)),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "attemptIndex",
      ethereum.Value.fromUnsignedBigInt(attemptIndex),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam("operator", ethereum.Value.fromAddress(operator)),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "claimExpiresAt",
      ethereum.Value.fromUnsignedBigInt(claimExpiresAt),
    ),
  );
  return event;
}

function buildMetadataSetEvent(
  agentId: BigInt,
  metadataKey: string,
  metadataValue: Bytes,
  txHash: Bytes,
  logIndex: BigInt,
): MetadataSet {
  let event = changetype<MetadataSet>(newMockEvent());
  event.parameters = new Array<ethereum.EventParam>();
  event.parameters.push(
    new ethereum.EventParam(
      "agentId",
      ethereum.Value.fromUnsignedBigInt(agentId),
    ),
  );
  // indexedMetadataKey is the keccak256 of the readable key, but the handler
  // never reads it — supply a stand-in keccak so the param shape is honest.
  let indexed = changetype<Bytes>(crypto.keccak256(Bytes.fromUTF8(metadataKey)));
  event.parameters.push(
    new ethereum.EventParam(
      "indexedMetadataKey",
      ethereum.Value.fromFixedBytes(indexed),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "metadataKey",
      ethereum.Value.fromString(metadataKey),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "metadataValue",
      ethereum.Value.fromBytes(metadataValue),
    ),
  );
  event.transaction.hash = txHash;
  event.logIndex = logIndex;
  return event;
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────
describe("TaskCoordinator V3 handlers", () => {
  beforeEach(() => {
    clearStore();
  });

  test("handleTaskCreated creates a Task with manifestDigest", () => {
    let taskId = BigInt.fromI32(42);
    let creator = Address.fromString(CREATOR_HEX);
    let manifestDigest = Bytes.fromHexString(MANIFEST_DIGEST_HEX) as Bytes;
    let taskCidDigest = Bytes.fromHexString(TASK_CID_DIGEST_HEX) as Bytes;

    let event = buildTaskCreatedEvent(
      taskId,
      creator,
      manifestDigest,
      taskCidDigest,
    );

    handleTaskCreated(event);

    assert.fieldEquals("Task", "42", "taskId", "42");
    assert.fieldEquals("Task", "42", "creator", CREATOR_HEX);
    assert.fieldEquals(
      "Task",
      "42",
      "manifestDigest",
      MANIFEST_DIGEST_HEX,
    );
    assert.fieldEquals(
      "Task",
      "42",
      "taskCidDigest",
      TASK_CID_DIGEST_HEX,
    );
    assert.fieldEquals("Task", "42", "maxClaims", "3");
    assert.fieldEquals("Task", "42", "requiredVerdicts", "1");
    assert.fieldEquals("Task", "42", "finalized", "false");
  });

  test("handleTaskClaimed creates TaskAttempt with status=CLAIMED", () => {
    // Seed the Task so the attempt's foreign key points at a real row.
    let taskId = BigInt.fromI32(42);
    let creator = Address.fromString(CREATOR_HEX);
    let manifestDigest = Bytes.fromHexString(MANIFEST_DIGEST_HEX) as Bytes;
    let taskCidDigest = Bytes.fromHexString(TASK_CID_DIGEST_HEX) as Bytes;
    handleTaskCreated(
      buildTaskCreatedEvent(taskId, creator, manifestDigest, taskCidDigest),
    );

    let attemptIndex = BigInt.fromI32(0);
    let operator = Address.fromString(OPERATOR_HEX);
    let claimExpiresAt = BigInt.fromI32(1700004000);
    let claimEvent = buildTaskClaimedEvent(
      taskId,
      attemptIndex,
      operator,
      claimExpiresAt,
    );

    handleTaskClaimed(claimEvent);

    let id = "42-0";
    assert.fieldEquals("TaskAttempt", id, "task", "42");
    assert.fieldEquals("TaskAttempt", id, "attemptIndex", "0");
    assert.fieldEquals("TaskAttempt", id, "operator", OPERATOR_HEX);
    assert.fieldEquals("TaskAttempt", id, "status", "CLAIMED");
    assert.fieldEquals(
      "TaskAttempt",
      id,
      "claimExpiresAt",
      claimExpiresAt.toString(),
    );
    assert.fieldEquals("TaskAttempt", id, "finalized", "false");
  });

  test(
    "handleMetadataSet with solvernet-manifest:<cid> creates SolverNetManifestEvent",
    () => {
      let agentId = BigInt.fromI32(5474);
      let cid = "bafkreitest1234567890";
      let key = "solvernet-manifest:" + cid;
      let payload = Bytes.fromHexString(METADATA_PAYLOAD_HEX) as Bytes;
      let txHash = Bytes.fromHexString(TX_HASH_HEX) as Bytes;
      let logIndex = BigInt.fromI32(7);

      let event = buildMetadataSetEvent(
        agentId,
        key,
        payload,
        txHash,
        logIndex,
      );

      handleMetadataSet(event);

      // SolverNetManifestEvent id is `<txHashHex>-<logIndexDec>`.
      let evtId = TX_HASH_HEX + "-7";
      assert.fieldEquals(
        "SolverNetManifestEvent",
        evtId,
        "agentId",
        "5474",
      );
      assert.fieldEquals(
        "SolverNetManifestEvent",
        evtId,
        "operator",
        "5474",
      );
      assert.fieldEquals(
        "SolverNetManifestEvent",
        evtId,
        "metadataKey",
        key,
      );
      assert.fieldEquals(
        "SolverNetManifestEvent",
        evtId,
        "manifestCid",
        cid,
      );
      assert.fieldEquals(
        "SolverNetManifestEvent",
        evtId,
        "logIndex",
        "7",
      );

      // The handler also falls through to the legacy MetadataEntry catch-all.
      // MetadataEntry id == `<agentId>-<keccak256(key hex)>`.
      let keyHash = changetype<Bytes>(crypto.keccak256(Bytes.fromUTF8(key)));
      let metadataEntryEntityId =
        agentId.toString() + "-" + keyHash.toHexString();
      assert.fieldEquals(
        "MetadataEntry",
        metadataEntryEntityId,
        "metadataKey",
        key,
      );
      assert.fieldEquals(
        "MetadataEntry",
        metadataEntryEntityId,
        "updateCount",
        "1",
      );
    },
  );
});
