// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SynapseAgentRegistry
 * @dev ERC-8004 Compatible Agent Registry for the Synapse Intent Network
 *      Stores minimal on-chain data with JSON URLs for full agent profiles
 *
 * This contract provides:
 * - Agent registration with wallet binding
 * - On-chain reputation tracking
 * - Event emission for indexing
 *
 * @custom:security-contact security@synapse.network
 */
contract SynapseAgentRegistry {
    // ============================================================
    // STRUCTS
    // ============================================================

    struct AgentProfile {
        string name;                    // Agent display name
        string agentJsonUrl;            // URL to /agent.json endpoint
        address walletAddress;          // Agent's operational wallet
        uint256 reputation;             // Reputation score (0-500, representing 0.0-5.0)
        uint256 totalFeedback;          // Total feedback count
        uint256 positiveFeedback;       // Positive feedback count
        uint256 registeredAt;           // Registration timestamp
        uint256 lastUpdated;            // Last update timestamp
        bool isActive;                  // Active status
    }

    // ============================================================
    // STATE VARIABLES
    // ============================================================

    /// @notice Mapping of agent ID to agent profile
    mapping(bytes32 => AgentProfile) public agents;

    /// @notice Mapping of wallet address to agent ID
    mapping(address => bytes32) public walletToAgent;

    /// @notice Array of all registered agent IDs
    bytes32[] public agentIds;

    /// @notice Owner of the contract
    address public owner;

    /// @notice Counter for generating unique agent IDs
    uint256 private _agentCounter;

    // ============================================================
    // EVENTS
    // ============================================================

    /// @notice Emitted when a new agent is registered
    event AgentRegistered(
        bytes32 indexed agentId,
        string name,
        address indexed walletAddress,
        string agentJsonUrl,
        uint256 timestamp
    );

    /// @notice Emitted when an agent profile is updated
    event AgentUpdated(
        bytes32 indexed agentId,
        string name,
        string agentJsonUrl,
        uint256 timestamp
    );

    /// @notice Emitted when an agent is deactivated
    event AgentDeactivated(
        bytes32 indexed agentId,
        uint256 timestamp
    );

    /// @notice Emitted when reputation is updated
    event ReputationUpdated(
        bytes32 indexed agentId,
        uint256 oldScore,
        uint256 newScore,
        uint256 totalFeedback,
        uint256 timestamp
    );

    /// @notice Emitted when feedback is submitted
    event FeedbackSubmitted(
        bytes32 indexed agentId,
        address indexed submitter,
        uint8 rating,
        bool success,
        uint256 timestamp
    );

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier agentExists(bytes32 agentId) {
        require(agents[agentId].registeredAt > 0, "Agent not found");
        _;
    }

    modifier onlyAgentOwner(bytes32 agentId) {
        require(agents[agentId].walletAddress == msg.sender, "Not agent owner");
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor() {
        owner = msg.sender;
    }

    // ============================================================
    // REGISTRATION FUNCTIONS
    // ============================================================

    /**
     * @notice Register a new agent
     * @param name Agent display name
     * @param agentJsonUrl URL to the agent's /agent.json endpoint
     * @param walletAddress Agent's operational wallet
     * @return agentId The unique identifier for the registered agent
     */
    function registerAgent(
        string calldata name,
        string calldata agentJsonUrl,
        address walletAddress
    ) external returns (bytes32 agentId) {
        require(bytes(name).length > 0, "Name required");
        require(bytes(agentJsonUrl).length > 0, "URL required");
        require(walletAddress != address(0), "Invalid wallet");
        require(walletToAgent[walletAddress] == bytes32(0), "Wallet already registered");

        // Generate unique agent ID
        _agentCounter++;
        agentId = keccak256(abi.encodePacked(
            block.timestamp,
            walletAddress,
            _agentCounter
        ));

        // Create agent profile
        agents[agentId] = AgentProfile({
            name: name,
            agentJsonUrl: agentJsonUrl,
            walletAddress: walletAddress,
            reputation: 300,        // Starting reputation: 3.0
            totalFeedback: 0,
            positiveFeedback: 0,
            registeredAt: block.timestamp,
            lastUpdated: block.timestamp,
            isActive: true
        });

        // Map wallet to agent
        walletToAgent[walletAddress] = agentId;
        agentIds.push(agentId);

        emit AgentRegistered(
            agentId,
            name,
            walletAddress,
            agentJsonUrl,
            block.timestamp
        );

        return agentId;
    }

    /**
     * @notice Update agent profile
     * @param agentId The agent's unique identifier
     * @param name New agent name (or empty to keep current)
     * @param agentJsonUrl New agent JSON URL (or empty to keep current)
     */
    function updateAgent(
        bytes32 agentId,
        string calldata name,
        string calldata agentJsonUrl
    ) external agentExists(agentId) onlyAgentOwner(agentId) {
        AgentProfile storage agent = agents[agentId];

        if (bytes(name).length > 0) {
            agent.name = name;
        }
        if (bytes(agentJsonUrl).length > 0) {
            agent.agentJsonUrl = agentJsonUrl;
        }

        agent.lastUpdated = block.timestamp;

        emit AgentUpdated(agentId, agent.name, agent.agentJsonUrl, block.timestamp);
    }

    /**
     * @notice Deactivate an agent
     * @param agentId The agent's unique identifier
     */
    function deactivateAgent(bytes32 agentId)
        external
        agentExists(agentId)
        onlyAgentOwner(agentId)
    {
        agents[agentId].isActive = false;
        agents[agentId].lastUpdated = block.timestamp;

        emit AgentDeactivated(agentId, block.timestamp);
    }

    // ============================================================
    // REPUTATION FUNCTIONS
    // ============================================================

    /**
     * @notice Submit feedback for an agent
     * @param agentId The agent's unique identifier
     * @param rating Rating from 1-5
     * @param success Whether the task was successful
     */
    function submitFeedback(
        bytes32 agentId,
        uint8 rating,
        bool success
    ) external agentExists(agentId) {
        require(rating >= 1 && rating <= 5, "Rating must be 1-5");

        AgentProfile storage agent = agents[agentId];
        uint256 oldScore = agent.reputation;

        // Update feedback counts
        agent.totalFeedback++;
        if (success && rating >= 4) {
            agent.positiveFeedback++;
        }

        // Calculate new reputation (weighted average)
        uint256 successRate = (agent.positiveFeedback * 100) / agent.totalFeedback;
        uint256 ratingContribution = (uint256(rating) * 100) / 5;

        // New score = 90% old + 10% new contribution
        uint256 newContribution = (successRate * 3 + ratingContribution * 2) / 5;
        agent.reputation = (agent.reputation * 90 + newContribution * 10) / 100;

        // Clamp to 0-500 range
        if (agent.reputation > 500) agent.reputation = 500;

        agent.lastUpdated = block.timestamp;

        emit FeedbackSubmitted(agentId, msg.sender, rating, success, block.timestamp);

        if (agent.reputation != oldScore) {
            emit ReputationUpdated(
                agentId,
                oldScore,
                agent.reputation,
                agent.totalFeedback,
                block.timestamp
            );
        }
    }

    /**
     * @notice Update reputation directly (owner only, for oracle integration)
     * @param agentId The agent's unique identifier
     * @param newReputation New reputation score
     */
    function setReputation(
        bytes32 agentId,
        uint256 newReputation
    ) external onlyOwner agentExists(agentId) {
        require(newReputation <= 500, "Max reputation is 500");

        uint256 oldScore = agents[agentId].reputation;
        agents[agentId].reputation = newReputation;
        agents[agentId].lastUpdated = block.timestamp;

        emit ReputationUpdated(
            agentId,
            oldScore,
            newReputation,
            agents[agentId].totalFeedback,
            block.timestamp
        );
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Get agent by ID
     * @param agentId The agent's unique identifier
     * @return Agent profile data
     */
    function getAgent(bytes32 agentId)
        external
        view
        returns (AgentProfile memory)
    {
        return agents[agentId];
    }

    /**
     * @notice Get agent by wallet address
     * @param wallet The wallet address to look up
     * @return Agent profile data
     */
    function getAgentByWallet(address wallet)
        external
        view
        returns (AgentProfile memory)
    {
        bytes32 agentId = walletToAgent[wallet];
        require(agentId != bytes32(0), "Agent not found");
        return agents[agentId];
    }

    /**
     * @notice Get agent ID by wallet address
     * @param wallet The wallet address to look up
     * @return The agent's unique identifier
     */
    function getAgentId(address wallet) external view returns (bytes32) {
        return walletToAgent[wallet];
    }

    /**
     * @notice Get total number of registered agents
     * @return Total count of agents
     */
    function getTotalAgents() external view returns (uint256) {
        return agentIds.length;
    }

    /**
     * @notice Get reputation score for an agent
     * @param agentId The agent's unique identifier
     * @return Reputation score (0-500)
     */
    function getReputation(bytes32 agentId)
        external
        view
        agentExists(agentId)
        returns (uint256)
    {
        return agents[agentId].reputation;
    }

    /**
     * @notice Check if an agent is active
     * @param agentId The agent's unique identifier
     * @return Active status
     */
    function isAgentActive(bytes32 agentId)
        external
        view
        agentExists(agentId)
        returns (bool)
    {
        return agents[agentId].isActive;
    }

    // ============================================================
    // ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Transfer contract ownership
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
