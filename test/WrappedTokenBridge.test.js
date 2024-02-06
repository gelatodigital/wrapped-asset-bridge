const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils, constants } = require("ethers");
const { deployLzV2Endpoint } = require("./utils/lzV2Endpoint");

describe("WrappedTokenBridge", () => {
  const originalTokenEid = 0;
  const wrappedTokenEid = 1;
  const amount = utils.parseEther("10");
  const pkMint = 0;

  let owner, user;
  let originalToken, wrappedToken;
  let wrappedTokenBridge;
  let wrappedTokenEndpoint, wrappedTokenBridgeFactory;
  let refundAddress, options;

  const createPayload = (pk = pkMint, token = originalToken.address) =>
    utils.defaultAbiCoder.encode(
      ["uint8", "address", "address", "uint256"],
      [pk, token, user.address, amount]
    );

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const originalTokenEndpoint = await deployLzV2Endpoint(
      owner,
      originalTokenEid,
      [wrappedTokenEid]
    );
    wrappedTokenEndpoint = await deployLzV2Endpoint(owner, wrappedTokenEid, [
      originalTokenEid,
    ]);

    const wethFactory = await ethers.getContractFactory("WETH9");
    const weth = await wethFactory.deploy();

    const eip173ProxyFactory = await ethers.getContractFactory(
      "EIP173Proxy2StepWithCustomReceive"
    );

    const originalTokenBridgeFactory = await ethers.getContractFactory(
      "OriginalTokenBridge"
    );
    const originalTokenBridgeImplementation =
      await originalTokenBridgeFactory.deploy(
        originalTokenEndpoint.address,
        weth.address
      );
    const originalTokenBridgeInitData =
      originalTokenBridgeImplementation.interface.encodeFunctionData(
        "initialize",
        [wrappedTokenEid]
      );
    const originalTokenBridgeProxy = await eip173ProxyFactory.deploy(
      originalTokenBridgeImplementation.address,
      owner.address,
      originalTokenBridgeInitData
    );
    const originalTokenBridge = await ethers.getContractAt(
      "OriginalTokenBridge",
      originalTokenBridgeProxy.address
    );

    const wrappedTokenBridgeFactory = await ethers.getContractFactory(
      "WrappedTokenBridgeHarness"
    );
    const wrappedTokenBridgeImplementation =
      await wrappedTokenBridgeFactory.deploy(wrappedTokenEndpoint.address);
    const wrappedTokenBridgeInitData =
      wrappedTokenBridgeImplementation.interface.encodeFunctionData(
        "initialize",
        []
      );
    const wrappedTokenBridgeProxy = await eip173ProxyFactory.deploy(
      wrappedTokenBridgeImplementation.address,
      owner.address,
      wrappedTokenBridgeInitData
    );
    wrappedTokenBridge = await ethers.getContractAt(
      "WrappedTokenBridgeHarness",
      wrappedTokenBridgeProxy.address
    );

    const ERC20Factory = await ethers.getContractFactory("MintableERC20Mock");
    originalToken = await ERC20Factory.deploy("TEST", "TEST");
    const originalERC20Decimals = await originalToken.decimals();

    const wrappedERC20Factory = await ethers.getContractFactory("WrappedERC20");
    wrappedToken = await wrappedERC20Factory.deploy(
      wrappedTokenBridge.address,
      "WTEST",
      "WTEST",
      originalERC20Decimals
    );

    await originalTokenBridge.setPeer(
      wrappedTokenEid,
      ethers.utils.hexZeroPad(wrappedTokenBridge.address, 32)
    );

    await wrappedTokenBridge.setPeer(
      originalTokenEid,
      ethers.utils.hexZeroPad(originalTokenBridge.address, 32)
    );

    refundAddress = user.address;
    options = "0x";
  });

  describe("registerToken", () => {
    it("reverts when called by non owner", async () => {
      await expect(
        wrappedTokenBridge
          .connect(user)
          .registerToken(
            wrappedToken.address,
            originalTokenEid,
            originalToken.address
          )
      ).to.be.revertedWith(`NOT_AUTHORIZED`);
    });

    it("reverts when local token is address zero", async () => {
      await expect(
        wrappedTokenBridge.registerToken(
          constants.AddressZero,
          originalTokenEid,
          originalToken.address
        )
      ).to.be.revertedWith("WrappedTokenBridge: invalid local token");
    });

    it("reverts when remote token is address zero", async () => {
      await expect(
        wrappedTokenBridge.registerToken(
          wrappedToken.address,
          originalTokenEid,
          constants.AddressZero
        )
      ).to.be.revertedWith("WrappedTokenBridge: invalid remote token");
    });

    it("reverts if token already registered", async () => {
      await wrappedTokenBridge.registerToken(
        wrappedToken.address,
        originalTokenEid,
        originalToken.address
      );
      await expect(
        wrappedTokenBridge.registerToken(
          wrappedToken.address,
          originalTokenEid,
          originalToken.address
        )
      ).to.be.revertedWith("WrappedTokenBridge: token already registered");
    });

    it("registers tokens", async () => {
      await wrappedTokenBridge.registerToken(
        wrappedToken.address,
        originalTokenEid,
        originalToken.address
      );

      expect(
        await wrappedTokenBridge.localToRemote(
          wrappedToken.address,
          originalTokenEid
        )
      ).to.be.eq(originalToken.address);
      expect(
        await wrappedTokenBridge.remoteToLocal(
          originalToken.address,
          originalTokenEid
        )
      ).to.be.eq(wrappedToken.address);
    });
  });

  describe("setWithdrawalFeeBps", () => {
    const withdrawalFeeBps = 10;
    it("reverts when fee bps is greater than or equal to 100%", async () => {
      await expect(
        wrappedTokenBridge.setWithdrawalFeeBps(10000)
      ).to.be.revertedWith("WrappedTokenBridge: invalid withdrawal fee");
    });

    it("reverts when called by non owner", async () => {
      await expect(
        wrappedTokenBridge.connect(user).setWithdrawalFeeBps(withdrawalFeeBps)
      ).to.be.revertedWith(`NOT_AUTHORIZED`);
    });

    it("sets withdrawal fee bps", async () => {
      await wrappedTokenBridge.setWithdrawalFeeBps(withdrawalFeeBps);
      expect(await wrappedTokenBridge.withdrawalFeeBps()).to.be.eq(
        withdrawalFeeBps
      );
    });
  });

  describe("_nonblockingLzReceive", () => {
    it("reverts when payload has incorrect packet type", async () => {
      const pkInvalid = 1;
      await expect(
        wrappedTokenBridge.simulateLzReceive(
          {
            srcEid: originalTokenEid,
            sender: ethers.utils.hexZeroPad(user.address, 32),
            nonce: 0,
          },
          createPayload(pkInvalid)
        )
      ).to.be.revertedWith("WrappedTokenBridge: unknown packet type");
    });

    it("reverts when tokens aren't registered", async () => {
      await expect(
        wrappedTokenBridge.simulateLzReceive(
          {
            srcEid: originalTokenEid,
            sender: ethers.utils.hexZeroPad(user.address, 32),
            nonce: 0,
          },
          createPayload()
        )
      ).to.be.revertedWith("WrappedTokenBridge: token is not supported");
    });

    it("mints wrapped tokens", async () => {
      await wrappedTokenBridge.registerToken(
        wrappedToken.address,
        originalTokenEid,
        originalToken.address
      );
      await wrappedTokenBridge.simulateLzReceive(
        {
          srcEid: originalTokenEid,
          sender: ethers.utils.hexZeroPad(user.address, 32),
          nonce: 0,
        },
        createPayload()
      );

      expect(await wrappedToken.totalSupply()).to.be.eq(amount);
      expect(await wrappedToken.balanceOf(user.address)).to.be.eq(amount);
      expect(
        await wrappedTokenBridge.totalValueLocked(
          originalTokenEid,
          originalToken.address
        )
      ).to.be.eq(amount);
    });
  });

  describe("bridge", () => {
    let fee;
    beforeEach(async () => {
      fee = (await wrappedTokenBridge.quote(originalTokenEid, false, options))
        .nativeFee;
    });

    it("reverts when token is address zero", async () => {
      await expect(
        wrappedTokenBridge
          .connect(user)
          .bridge(
            constants.AddressZero,
            originalTokenEid,
            amount,
            user.address,
            false,
            options,
            refundAddress,
            { value: fee }
          )
      ).to.be.revertedWith("WrappedTokenBridge: invalid token");
    });

    it("reverts when to is address zero", async () => {
      await expect(
        wrappedTokenBridge
          .connect(user)
          .bridge(
            wrappedToken.address,
            originalTokenEid,
            amount,
            constants.AddressZero,
            false,
            options,
            refundAddress,
            { value: fee }
          )
      ).to.be.revertedWith("WrappedTokenBridge: invalid to");
    });

    it("reverts when token is not registered", async () => {
      await expect(
        wrappedTokenBridge
          .connect(user)
          .bridge(
            wrappedToken.address,
            originalTokenEid,
            amount,
            user.address,
            false,
            options,
            refundAddress,
            { value: fee }
          )
      ).to.be.revertedWith("WrappedTokenBridge: token is not supported");
    });

    it("reverts when amount is 0", async () => {
      await wrappedTokenBridge.registerToken(
        wrappedToken.address,
        originalTokenEid,
        originalToken.address
      );
      await expect(
        wrappedTokenBridge
          .connect(user)
          .bridge(
            wrappedToken.address,
            originalTokenEid,
            0,
            user.address,
            false,
            options,
            refundAddress,
            { value: fee }
          )
      ).to.be.revertedWith("WrappedTokenBridge: invalid amount");
    });

    it("burns wrapped tokens", async () => {
      await wrappedTokenBridge.registerToken(
        wrappedToken.address,
        originalTokenEid,
        originalToken.address
      );

      // Tokens minted
      await wrappedTokenBridge.simulateLzReceive(
        {
          srcEid: originalTokenEid,
          sender: ethers.utils.hexZeroPad(user.address, 32),
          nonce: 0,
        },
        createPayload()
      );

      expect(await wrappedToken.totalSupply()).to.be.eq(amount);
      expect(await wrappedToken.balanceOf(user.address)).to.be.eq(amount);
      expect(
        await wrappedTokenBridge.totalValueLocked(
          originalTokenEid,
          originalToken.address
        )
      ).to.be.eq(amount);

      await wrappedToken
        .connect(user)
        .approve(wrappedTokenBridge.address, amount);

      // Tokens burned
      await wrappedTokenBridge
        .connect(user)
        .bridge(
          wrappedToken.address,
          originalTokenEid,
          amount,
          user.address,
          false,
          options,
          refundAddress,
          { value: fee }
        );

      expect(await wrappedToken.totalSupply()).to.be.eq(0);
      expect(await wrappedToken.balanceOf(user.address)).to.be.eq(0);
      expect(
        await wrappedTokenBridge.totalValueLocked(
          originalTokenEid,
          originalToken.address
        )
      ).to.be.eq(0);
    });
  });
});
