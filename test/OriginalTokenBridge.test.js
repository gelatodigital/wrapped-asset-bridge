const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils, constants, BigNumber } = require("ethers");
const { deployLzV2Endpoint } = require("./utils/lzV2Endpoint");
const { Options } = require("@layerzerolabs/lz-v2-utilities");

describe("OriginalTokenBridge", () => {
  const originalTokenEid = 0;
  const wrappedTokenEid = 1;
  const amount = utils.parseEther("10");
  const pkUnlock = 1;
  const sharedDecimals = 6;
  const wethSharedDecimals = 18;

  let owner, user;
  let originalToken, weth;
  let originalTokenBridge;
  let wrappedTokenBridge;
  let originalTokenEndpoint, originalTokenBridgeFactory;
  let refundAddress, options;

  const createPayload = (
    pk = pkUnlock,
    token = originalToken.address,
    withdrawalAmount = amount,
    totalAmount = amount,
    unwrapWeth = false
  ) =>
    utils.defaultAbiCoder.encode(
      ["uint8", "address", "address", "uint256", "uint256", "bool"],
      [pk, token, user.address, withdrawalAmount, totalAmount, unwrapWeth]
    );

  beforeEach(async () => {
    [owner, user, newOwner] = await ethers.getSigners();

    const wethFactory = await ethers.getContractFactory("WETH9");
    weth = await wethFactory.deploy();

    originalTokenEndpoint = await deployLzV2Endpoint(owner, originalTokenEid, [
      wrappedTokenEid,
    ]);
    const wrappedTokenEndpoint = await deployLzV2Endpoint(
      owner,
      wrappedTokenEid,
      [originalTokenEid]
    );

    const eip173ProxyFactory = await ethers.getContractFactory(
      "EIP173Proxy2StepWithCustomReceive"
    );

    originalTokenBridgeFactory = await ethers.getContractFactory(
      "OriginalTokenBridgeHarness"
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

    originalTokenBridge = await ethers.getContractAt(
      "OriginalTokenBridgeHarness",
      originalTokenBridgeProxy.address
    );

    const wrappedTokenBridgeFactory = await ethers.getContractFactory(
      "WrappedTokenBridge"
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
      "WrappedTokenBridge",
      wrappedTokenBridgeProxy.address
    );

    await originalTokenBridge.setPeer(
      wrappedTokenEid,
      ethers.utils.hexZeroPad(wrappedTokenBridge.address, 32)
    );
    await wrappedTokenBridge.setPeer(
      originalTokenEid,
      ethers.utils.hexZeroPad(originalTokenBridge.address, 32)
    );

    const ERC20Factory = await ethers.getContractFactory("MintableERC20Mock");
    originalToken = await ERC20Factory.deploy("TEST", "TEST");

    await originalToken.mint(user.address, amount);

    refundAddress = user.address;
    options = "0x";
  });

  it("reverts when passing address zero as WETH in the constructor", async () => {
    await expect(
      originalTokenBridgeFactory.deploy(
        originalTokenEndpoint.address,
        constants.AddressZero
      )
    ).to.be.revertedWith("OriginalTokenBridge: invalid WETH address");
  });

  describe("registerToken", () => {
    it("reverts when passing address zero", async () => {
      await expect(
        originalTokenBridge.registerToken(constants.AddressZero, sharedDecimals)
      ).to.be.revertedWith("OriginalTokenBridge: invalid token address");
    });

    it("reverts if token already registered", async () => {
      await originalTokenBridge.registerToken(
        originalToken.address,
        sharedDecimals
      );
      await expect(
        originalTokenBridge.registerToken(originalToken.address, sharedDecimals)
      ).to.be.revertedWith("OriginalTokenBridge: token already registered");
    });

    it("reverts when called by non owner", async () => {
      await expect(
        originalTokenBridge
          .connect(user)
          .registerToken(originalToken.address, sharedDecimals)
      ).to.be.revertedWith(`NOT_AUTHORIZED`);
    });

    it("reverts when shared decimals is greater than local decimals", async () => {
      const invalidSharedDecimals = 19;
      await expect(
        originalTokenBridge.registerToken(
          originalToken.address,
          invalidSharedDecimals
        )
      ).to.be.revertedWith(
        "OriginalTokenBridge: shared decimals must be less than or equal to local decimals"
      );
    });

    it("registers token and saves local to shared decimals conversion rate", async () => {
      await originalTokenBridge.registerToken(
        originalToken.address,
        sharedDecimals
      );
      expect(await originalTokenBridge.supportedTokens(originalToken.address))
        .to.be.true;
      expect(
        (
          await originalTokenBridge.LDtoSDConversionRate(originalToken.address)
        ).toNumber()
      ).to.be.eq(10 ** 12);
    });
  });

  describe("setRemoteEid", () => {
    const newRemoteEid = 2;
    it("reverts when called by non owner", async () => {
      await expect(
        originalTokenBridge.connect(user).setRemoteEid(newRemoteEid)
      ).to.be.revertedWith(`NOT_AUTHORIZED`);
    });

    it("sets remote chain id", async () => {
      await originalTokenBridge.setRemoteEid(newRemoteEid);
      expect(await originalTokenBridge.remoteEid()).to.be.eq(newRemoteEid);
    });
  });

  describe("bridge", () => {
    let fee;
    beforeEach(async () => {
      fee = (await originalTokenBridge.quote(wrappedTokenEid, false, options))
        .nativeFee;
      await originalToken
        .connect(user)
        .approve(originalTokenBridge.address, amount);
    });

    it("reverts when to is address zero", async () => {
      await originalTokenBridge.registerToken(
        originalToken.address,
        sharedDecimals
      );
      await expect(
        originalTokenBridge
          .connect(user)
          .bridge(
            originalToken.address,
            amount,
            constants.AddressZero,
            options,
            refundAddress,
            { value: fee }
          )
      ).to.be.revertedWith("OriginalTokenBridge: invalid to");
    });

    it("reverts when token is not registered", async () => {
      await expect(
        originalTokenBridge
          .connect(user)
          .bridge(
            originalToken.address,
            amount,
            user.address,
            options,
            refundAddress,
            { value: fee }
          )
      ).to.be.revertedWith("OriginalTokenBridge: token is not supported");
    });

    it("reverts when amount is 0", async () => {
      await originalTokenBridge.registerToken(
        originalToken.address,
        sharedDecimals
      );
      await expect(
        originalTokenBridge
          .connect(user)
          .bridge(
            originalToken.address,
            0,
            user.address,
            options,
            refundAddress,
            { value: fee }
          )
      ).to.be.revertedWith("OriginalTokenBridge: invalid amount");
    });

    it("reverts when the sender doesn't have enough tokens", async () => {
      const newAmount = amount.add(utils.parseEther("0.001"));
      await originalToken
        .connect(user)
        .approve(originalTokenBridge.address, newAmount);
      await originalTokenBridge.registerToken(
        originalToken.address,
        sharedDecimals
      );
      await expect(
        originalTokenBridge
          .connect(user)
          .bridge(
            originalToken.address,
            newAmount,
            user.address,
            options,
            refundAddress,
            { value: fee }
          )
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      it("locks tokens in the contract", async () => {
        await originalTokenBridge.registerToken(
          originalToken.address,
          sharedDecimals
        );
        await originalTokenBridge
          .connect(user)
          .bridge(
            originalToken.address,
            amount,
            user.address,
            options,
            refundAddress,
            { value: fee }
          );
        const LDtoSD = await originalTokenBridge.LDtoSDConversionRate(
          originalToken.address
        );

        expect(
          await originalTokenBridge.totalValueLockedSD(originalToken.address)
        ).to.be.eq(amount.div(LDtoSD));
        expect(
          await originalToken.balanceOf(originalTokenBridge.address)
        ).to.be.eq(amount);
        expect(await originalToken.balanceOf(user.address)).to.be.eq(0);
      });

      it("locks tokens in the contract and returns dust to the sender", async () => {
        const dust = BigNumber.from("12345");
        const amountWithDust = amount.add(dust);

        await originalTokenBridge.registerToken(
          originalToken.address,
          sharedDecimals
        );
        await originalToken.mint(user.address, dust);
        await originalToken
          .connect(user)
          .approve(originalTokenBridge.address, amountWithDust);
        await originalTokenBridge
          .connect(user)
          .bridge(
            originalToken.address,
            amountWithDust,
            user.address,
            options,
            refundAddress,
            { value: fee }
          );
        const LDtoSD = await originalTokenBridge.LDtoSDConversionRate(
          originalToken.address
        );

        expect(
          await originalTokenBridge.totalValueLockedSD(originalToken.address)
        ).to.be.eq(amount.div(LDtoSD));
        expect(
          await originalToken.balanceOf(originalTokenBridge.address)
        ).to.be.eq(amount);
        expect(await originalToken.balanceOf(user.address)).to.be.eq(dust);
      });
    });

    describe("bridgeNative", () => {
      let totalAmount;
      beforeEach(async () => {
        const fee = (
          await originalTokenBridge.quote(wrappedTokenEid, false, options)
        ).nativeFee;
        totalAmount = amount.add(fee);
      });

      it("reverts when to is address zero", async () => {
        await originalTokenBridge.registerToken(
          weth.address,
          wethSharedDecimals
        );
        await expect(
          originalTokenBridge
            .connect(user)
            .bridgeNative(
              amount,
              constants.AddressZero,
              options,
              refundAddress,
              { value: totalAmount }
            )
        ).to.be.revertedWith("OriginalTokenBridge: invalid to");
      });

      it("reverts when WETH is not registered", async () => {
        await expect(
          originalTokenBridge
            .connect(user)
            .bridgeNative(amount, user.address, options, refundAddress, {
              value: totalAmount,
            })
        ).to.be.revertedWith("OriginalTokenBridge: token is not supported");
      });

      it("reverts when amount is 0", async () => {
        await originalTokenBridge.registerToken(
          weth.address,
          wethSharedDecimals
        );
        await expect(
          originalTokenBridge
            .connect(user)
            .bridgeNative(0, user.address, options, refundAddress, {
              value: totalAmount,
            })
        ).to.be.revertedWith("OriginalTokenBridge: invalid amount");
      });

      it("reverts when value is less than amount", async () => {
        await originalTokenBridge.registerToken(
          weth.address,
          wethSharedDecimals
        );
        await expect(
          originalTokenBridge
            .connect(user)
            .bridgeNative(amount, user.address, options, refundAddress, {
              value: 0,
            })
        ).to.be.revertedWith("OriginalTokenBridge: not enough value sent");
      });

      it("locks WETH in the contract", async () => {
        await originalTokenBridge.registerToken(
          weth.address,
          wethSharedDecimals
        );
        await originalTokenBridge
          .connect(user)
          .bridgeNative(amount, user.address, options, refundAddress, {
            value: totalAmount,
          });

        expect(
          await originalTokenBridge.totalValueLockedSD(weth.address)
        ).to.be.eq(amount);
        expect(await weth.balanceOf(originalTokenBridge.address)).to.be.eq(
          amount
        );
      });
    });

    describe("_lzReceive", () => {
      beforeEach(async () => {
        await originalTokenBridge.registerToken(
          originalToken.address,
          sharedDecimals
        );
      });

      it("reverts when received from an unknown chain", async () => {
        await expect(
          originalTokenBridge.simulateLzReceive(
            {
              srcEid: originalTokenEid,
              sender: ethers.utils.hexZeroPad(user.address, 32),
              nonce: 0,
            },
            "0x"
          )
        ).to.be.revertedWith("OriginalTokenBridge: invalid source chain id");
      });

      it("reverts when payload has incorrect packet type", async () => {
        const pkUnknown = 0;
        await expect(
          originalTokenBridge.simulateLzReceive(
            {
              srcEid: wrappedTokenEid,
              sender: ethers.utils.hexZeroPad(user.address, 32),
              nonce: 0,
            },
            createPayload(pkUnknown)
          )
        ).to.be.revertedWith("OriginalTokenBridge: unknown packet type");
      });

      it("reverts when a token is not supported", async () => {
        const ERC20Factory = await ethers.getContractFactory(
          "MintableERC20Mock"
        );
        const newToken = await ERC20Factory.deploy("NEW", "NEW");
        await expect(
          originalTokenBridge.simulateLzReceive(
            {
              srcEid: wrappedTokenEid,
              sender: ethers.utils.hexZeroPad(user.address, 32),
              nonce: 0,
            },
            createPayload(pkUnlock, newToken.address)
          )
        ).to.be.revertedWith("OriginalTokenBridge: token is not supported");
      });

      it("unlocks, collects withdrawal fees and transfers funds to the recipient", async () => {
        const LDtoSD = await originalTokenBridge.LDtoSDConversionRate(
          originalToken.address
        );
        const bridgingFee = (
          await originalTokenBridge.quote(wrappedTokenEid, false, options)
        ).nativeFee;
        const withdrawalFee = amount.div(100);
        const withdrawalAmount = amount.sub(withdrawalFee);
        const withdrawalAmountSD = withdrawalAmount.div(LDtoSD);
        const totalAmountSD = amount.div(LDtoSD);

        // Setup
        await originalToken
          .connect(user)
          .approve(originalTokenBridge.address, amount);

        // Bridge
        await originalTokenBridge
          .connect(user)
          .bridge(
            originalToken.address,
            amount,
            user.address,
            options,
            refundAddress,
            { value: bridgingFee }
          );

        expect(await originalToken.balanceOf(user.address)).to.be.eq(0);
        expect(
          await originalToken.balanceOf(originalTokenBridge.address)
        ).to.be.eq(amount);

        // Receive
        await originalTokenBridge.simulateLzReceive(
          {
            srcEid: wrappedTokenEid,
            sender: ethers.utils.hexZeroPad(user.address, 32),
            nonce: 0,
          },
          createPayload(
            pkUnlock,
            originalToken.address,
            withdrawalAmountSD,
            totalAmountSD
          )
        );

        expect(
          await originalTokenBridge.totalValueLockedSD(originalToken.address)
        ).to.be.eq(0);
        expect(
          await originalToken.balanceOf(originalTokenBridge.address)
        ).to.be.eq(withdrawalFee);
        expect(await originalToken.balanceOf(user.address)).to.be.eq(
          withdrawalAmount
        );
      });

      it("unlocks WETH and transfers ETH to the recipient", async () => {
        const bridgingFee = (
          await originalTokenBridge.quote(wrappedTokenEid, false, options)
        ).nativeFee;
        totalAmount = amount.add(bridgingFee);

        // Setup
        await originalTokenBridge.registerToken(
          weth.address,
          wethSharedDecimals
        );

        // Bridge
        await originalTokenBridge
          .connect(user)
          .bridgeNative(amount, user.address, options, refundAddress, {
            value: totalAmount,
          });
        const recipientBalanceBefore = await ethers.provider.getBalance(
          user.address
        );

        // Receive
        await originalTokenBridge.simulateLzReceive(
          {
            srcEid: wrappedTokenEid,
            sender: ethers.utils.hexZeroPad(user.address, 32),
            nonce: 0,
          },
          createPayload(pkUnlock, weth.address, amount, amount, true)
        );

        expect(
          await originalTokenBridge.totalValueLockedSD(weth.address)
        ).to.be.eq(0);
        expect(await weth.balanceOf(originalTokenBridge.address)).to.be.eq(0);
        expect(await weth.balanceOf(user.address)).to.be.eq(0);
        expect(await ethers.provider.getBalance(user.address)).to.be.eq(
          recipientBalanceBefore.add(amount)
        );
      });
    });

    describe("withdrawFee", () => {
      beforeEach(async () => {
        await originalTokenBridge.registerToken(
          originalToken.address,
          sharedDecimals
        );
      });

      it("reverts when called by non owner", async () => {
        await expect(
          originalTokenBridge
            .connect(user)
            .withdrawFee(originalToken.address, owner.address, 1)
        ).to.be.revertedWith(`NOT_AUTHORIZED`);
      });

      it("reverts when not enough fees collected", async () => {
        await expect(
          originalTokenBridge.withdrawFee(
            originalToken.address,
            owner.address,
            1
          )
        ).to.be.revertedWith("OriginalTokenBridge: not enough fees collected");
      });

      it("withdraws fees", async () => {
        const LDtoSD = await originalTokenBridge.LDtoSDConversionRate(
          originalToken.address
        );
        const bridgingFee = (
          await originalTokenBridge.quote(wrappedTokenEid, false, options)
        ).nativeFee;
        const withdrawalFee = amount.div(100);
        const withdrawalAmountSD = amount.sub(withdrawalFee).div(LDtoSD);
        const totalAmountSD = amount.div(LDtoSD);

        await originalToken
          .connect(user)
          .approve(originalTokenBridge.address, amount);
        await originalTokenBridge
          .connect(user)
          .bridge(
            originalToken.address,
            amount,
            user.address,
            options,
            refundAddress,
            { value: bridgingFee }
          );
        await originalTokenBridge.simulateLzReceive(
          {
            srcEid: wrappedTokenEid,
            sender: ethers.utils.hexZeroPad(user.address, 32),
            nonce: 0,
          },
          createPayload(
            pkUnlock,
            originalToken.address,
            withdrawalAmountSD,
            totalAmountSD
          )
        );

        await originalTokenBridge.withdrawFee(
          originalToken.address,
          owner.address,
          withdrawalFee
        );
        expect(await originalToken.balanceOf(owner.address)).to.be.eq(
          withdrawalFee
        );
      });
    });
  });
});
