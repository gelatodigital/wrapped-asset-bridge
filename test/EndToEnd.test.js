const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils, constants } = require("ethers");
const {
  deployLzV2Endpoint,
  deployLzV2EndpointMock,
} = require("./utils/lzV2Endpoint");

describe("End to End", function () {
  const ethereumEid = 0;
  const polygonEid = 1;
  const wrappedTokenEid = 2;
  const ethereumAmount = utils.parseEther("10");
  const polygonAmount = utils.parseEther("5");
  const name = "TEST";
  const symbol = "TEST";
  const sharedDecimals = 6;
  const wethSharedDecimals = 18;

  let owner, user;
  let ethereumERC20, weth, polygonERC20, wmatic, wrappedToken;
  let ethereumBridge, polygonBridge, wrappedTokenBridge;
  let ethereumEndpoint, polygonEndpoint, wrappedTokenEndpoint;
  let options, refundAddress;
  let ethereumAmountSD, polygonAmountSD;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    ethereumEndpoint = await deployLzV2EndpointMock(owner, ethereumEid, [
      wrappedTokenEid,
    ]);
    polygonEndpoint = await deployLzV2EndpointMock(owner, polygonEid, [
      wrappedTokenEid,
    ]);
    wrappedTokenEndpoint = await deployLzV2EndpointMock(
      owner,
      wrappedTokenEid,
      [ethereumEid, polygonEid]
    );

    const wethFactory = await ethers.getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    wmatic = await wethFactory.deploy();

    const eip173ProxyFactory = await ethers.getContractFactory(
      "EIP173Proxy2StepWithCustomReceive"
    );
    const originalTokenBridgeFactory = await ethers.getContractFactory(
      "OriginalTokenBridgeHarness"
    );
    const ethereumBridgeImplementation =
      await originalTokenBridgeFactory.deploy(
        ethereumEndpoint.address,
        weth.address
      );
    const originalTokenBridgeInitData =
      ethereumBridgeImplementation.interface.encodeFunctionData("initialize", [
        wrappedTokenEid,
      ]);

    const ethereumBridgeProxy = await eip173ProxyFactory.deploy(
      ethereumBridgeImplementation.address,
      owner.address,
      originalTokenBridgeInitData
    );
    ethereumBridge = new ethers.Contract(
      ethereumBridgeProxy.address,
      ethereumBridgeImplementation.interface,
      owner
    );

    const polygonBridgeImplementation = await originalTokenBridgeFactory.deploy(
      polygonEndpoint.address,
      wmatic.address
    );
    const polygonBridgeProxy = await eip173ProxyFactory.deploy(
      polygonBridgeImplementation.address,
      owner.address,
      originalTokenBridgeInitData
    );
    polygonBridge = new ethers.Contract(
      polygonBridgeProxy.address,
      polygonBridgeImplementation.interface,
      owner
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
    wrappedTokenBridge = new ethers.Contract(
      wrappedTokenBridgeProxy.address,
      wrappedTokenBridgeImplementation.interface,
      owner
    );

    const ERC20Factory = await ethers.getContractFactory("MintableERC20Mock");
    ethereumERC20 = await ERC20Factory.deploy(name, symbol);
    polygonERC20 = await ERC20Factory.deploy(name, symbol);

    const wrappedERC20Factory = await ethers.getContractFactory("WrappedERC20");
    wrappedToken = await wrappedERC20Factory.deploy(
      wrappedTokenBridge.address,
      name,
      symbol,
      sharedDecimals
    );

    await ethereumBridge.setPeer(
      wrappedTokenEid,
      ethers.utils.hexZeroPad(wrappedTokenBridge.address, 32)
    );
    await wrappedTokenBridge.setPeer(
      ethereumEid,
      ethers.utils.hexZeroPad(wrappedTokenEndpoint.address, 32)
    );
    await wrappedTokenBridge.setPeer(
      polygonEid,
      ethers.utils.hexZeroPad(wrappedTokenEndpoint.address, 32)
    );
    await polygonBridge.setPeer(
      wrappedTokenEid,
      ethers.utils.hexZeroPad(wrappedTokenBridge.address, 32)
    );

    await ethereumERC20.mint(user.address, ethereumAmount);
    await polygonERC20.mint(user.address, polygonAmount);

    refundAddress = user.address;
    options = "0x";
  });

  describe("bridge 10 ERC20 tokens from Ethereum", function () {
    beforeEach(async () => {
      await ethereumBridge.registerToken(ethereumERC20.address, sharedDecimals);
      await wrappedTokenBridge.registerToken(
        wrappedToken.address,
        ethereumEid,
        ethereumERC20.address
      );

      await ethereumERC20
        .connect(user)
        .approve(ethereumBridge.address, ethereumAmount);
      const fee = await ethereumBridge.quote(wrappedTokenEid, false, options);
      await ethereumBridge
        .connect(user)
        .bridge(
          ethereumERC20.address,
          ethereumAmount,
          user.address,
          options,
          refundAddress,
          { value: fee.nativeFee }
        );

      const LDtoSD = await ethereumBridge.LDtoSDConversionRate(
        ethereumERC20.address
      );
      ethereumAmountSD = ethereumAmount.div(LDtoSD);
    });

    it("locks original tokens", async () => {
      expect(
        await ethereumBridge.totalValueLockedSD(ethereumERC20.address)
      ).to.be.eq(ethereumAmountSD);
      expect(await ethereumERC20.balanceOf(ethereumBridge.address)).to.be.eq(
        ethereumAmount
      );
    });

    it("mints wrapped tokens", async () => {
      expect(await wrappedToken.totalSupply()).to.be.eq(ethereumAmountSD);
      expect(await wrappedToken.balanceOf(user.address)).to.be.eq(
        ethereumAmountSD
      );
      expect(
        await wrappedTokenBridge.totalValueLocked(
          ethereumEid,
          ethereumERC20.address
        )
      ).to.be.eq(ethereumAmountSD);
    });

    describe("bridge 5 ERC20 tokens from Polygon", function () {
      beforeEach(async () => {
        await polygonBridge.registerToken(polygonERC20.address, sharedDecimals);
        await wrappedTokenBridge.registerToken(
          wrappedToken.address,
          polygonEid,
          polygonERC20.address
        );

        await polygonERC20
          .connect(user)
          .approve(polygonBridge.address, polygonAmount);
        const fee = await polygonBridge.quote(wrappedTokenEid, false, options);

        await polygonBridge
          .connect(user)
          .bridge(
            polygonERC20.address,
            polygonAmount,
            user.address,
            options,
            refundAddress,
            { value: fee.nativeFee }
          );

        const LDtoSD = await ethereumBridge.LDtoSDConversionRate(
          ethereumERC20.address
        );
        polygonAmountSD = polygonAmount.div(LDtoSD);
      });

      it("locks original tokens", async () => {
        expect(
          await polygonBridge.totalValueLockedSD(polygonERC20.address)
        ).to.be.eq(polygonAmountSD);
        expect(await polygonERC20.balanceOf(polygonBridge.address)).to.be.eq(
          polygonAmount
        );
      });

      it("mints wrapped tokens", async () => {
        const totalAmountSD = ethereumAmountSD.add(polygonAmountSD);
        expect(await wrappedToken.totalSupply()).to.be.eq(totalAmountSD);
        expect(await wrappedToken.balanceOf(user.address)).to.be.eq(
          totalAmountSD
        );
        expect(
          await wrappedTokenBridge.totalValueLocked(
            ethereumEid,
            ethereumERC20.address
          )
        ).to.be.eq(ethereumAmountSD);
        expect(
          await wrappedTokenBridge.totalValueLocked(
            polygonEid,
            polygonERC20.address
          )
        ).to.be.eq(polygonAmountSD);
      });

      it("reverts when trying to bridge 6 wrapped tokens to Polygon", async () => {
        const amount = polygonAmountSD.add(
          utils.parseUnits("1", sharedDecimals)
        );
        const fee = await wrappedTokenBridge.quote(polygonEid, false, options);

        it("reverts when called by non owner", async () => {
          await expect(
            wrappedTokenBridge
              .connect(user)
              .bridge(
                wrappedToken.address,
                polygonEid,
                amount,
                user.address,
                false,
                options,
                refundAddress,
                { value: fee.nativeFee }
              )
          ).to.be.revertedWith(
            "WrappedTokenBridge: insufficient liquidity on the destination"
          );
        });
      });

      describe("bridge 10 wrapped ERC20 tokens to Ethereum", function () {
        beforeEach(async () => {
          const fee = await wrappedTokenBridge.quote(
            ethereumEid,
            false,
            options
          );
          await wrappedToken
            .connect(user)
            .approve(wrappedTokenBridge.address, ethereumAmountSD);

          await ethereumBridge.setPeer(
            wrappedTokenEid,
            ethers.utils.hexZeroPad(ethereumEndpoint.address, 32)
          );
          await wrappedTokenBridge.setPeer(
            ethereumEid,
            ethers.utils.hexZeroPad(ethereumBridge.address, 32)
          );

          await wrappedTokenBridge
            .connect(user)
            .bridge(
              wrappedToken.address,
              ethereumEid,
              ethereumAmountSD,
              user.address,
              false,
              options,
              refundAddress,
              { value: fee.nativeFee }
            );
        });

        it("burns wrapped tokens", async () => {
          expect(await wrappedToken.totalSupply()).to.be.eq(polygonAmountSD);
          expect(await wrappedToken.balanceOf(user.address)).to.be.eq(
            polygonAmountSD
          );
          expect(
            await wrappedTokenBridge.totalValueLocked(
              ethereumEid,
              ethereumERC20.address
            )
          ).to.be.eq(0);
        });

        it("unlocks original tokens", async () => {
          expect(
            await ethereumBridge.totalValueLockedSD(ethereumERC20.address)
          ).to.be.eq(0);
          expect(
            await ethereumERC20.balanceOf(ethereumBridge.address)
          ).to.be.eq(0);
          expect(await ethereumERC20.balanceOf(user.address)).to.be.eq(
            ethereumAmount
          );
        });

        describe("bridge 5 wrapped ERC20 tokens to Polygon", function () {
          beforeEach(async () => {
            const fee = await wrappedTokenBridge.quote(
              polygonEid,
              false,
              options
            );

            await wrappedToken
              .connect(user)
              .approve(wrappedTokenBridge.address, polygonAmountSD);

            await polygonBridge.setPeer(
              wrappedTokenEid,
              ethers.utils.hexZeroPad(polygonEndpoint.address, 32)
            );
            await wrappedTokenBridge.setPeer(
              polygonEid,
              ethers.utils.hexZeroPad(polygonBridge.address, 32)
            );

            await wrappedTokenBridge
              .connect(user)
              .bridge(
                wrappedToken.address,
                polygonEid,
                polygonAmountSD,
                user.address,
                false,
                options,
                refundAddress,
                { value: fee.nativeFee }
              );
          });

          it("burns wrapped tokens", async () => {
            expect(await wrappedToken.totalSupply()).to.be.eq(0);
            expect(await wrappedToken.balanceOf(user.address)).to.be.eq(0);
            expect(
              await wrappedTokenBridge.totalValueLocked(
                polygonEid,
                polygonERC20.address
              )
            ).to.be.eq(0);
          });

          it("unlocks original tokens", async () => {
            expect(
              await polygonBridge.totalValueLockedSD(polygonERC20.address)
            ).to.be.eq(0);
            expect(
              await polygonERC20.balanceOf(polygonBridge.address)
            ).to.be.eq(0);
            expect(await polygonERC20.balanceOf(user.address)).to.be.eq(
              polygonAmount
            );
          });
        });
      });
    });
  });

  describe("bridge ETH from Ethereum", function () {
    beforeEach(async () => {
      await ethereumBridge.registerToken(weth.address, wethSharedDecimals);
      await wrappedTokenBridge.registerToken(
        wrappedToken.address,
        ethereumEid,
        weth.address
      );

      const fee = await ethereumBridge.quote(wrappedTokenEid, false, options);
      await ethereumBridge
        .connect(user)
        .bridgeNative(ethereumAmount, user.address, options, refundAddress, {
          value: ethereumAmount.add(fee.nativeFee),
        });
    });

    it("locks WETH", async () => {
      expect(await ethereumBridge.totalValueLockedSD(weth.address)).to.be.eq(
        ethereumAmount
      );
      expect(await weth.balanceOf(ethereumBridge.address)).to.be.eq(
        ethereumAmount
      );
    });

    it("mints wrapped tokens", async () => {
      expect(await wrappedToken.totalSupply()).to.be.eq(ethereumAmount);
      expect(await wrappedToken.balanceOf(user.address)).to.be.eq(
        ethereumAmount
      );
      expect(
        await wrappedTokenBridge.totalValueLocked(ethereumEid, weth.address)
      ).to.be.eq(ethereumAmount);
    });

    describe("bridge wrapped WETH token to Ethereum and collects fees", function () {
      let recipientBalanceBefore;
      let withdrawalFee;
      const unwrapWeth = true;
      const toNumber = (bigNumber) =>
        parseFloat(utils.formatEther(bigNumber.toString()));

      beforeEach(async () => {
        const withdrawalFeeBps = 20; // 0.2%
        const totalBps = await wrappedTokenBridge.TOTAL_BPS(); // 100%
        withdrawalFee = ethereumAmount.mul(withdrawalFeeBps).div(totalBps);
        await wrappedTokenBridge.setWithdrawalFeeBps(withdrawalFeeBps);

        recipientBalanceBefore = toNumber(
          await ethers.provider.getBalance(user.address)
        );
        const fee = await wrappedTokenBridge.quote(ethereumEid, false, options);

        await wrappedToken
          .connect(user)
          .approve(wrappedTokenBridge.address, ethereumAmount);

        await ethereumBridge.setPeer(
          wrappedTokenEid,
          ethers.utils.hexZeroPad(ethereumEndpoint.address, 32)
        );
        await wrappedTokenBridge.setPeer(
          ethereumEid,
          ethers.utils.hexZeroPad(ethereumBridge.address, 32)
        );

        await wrappedTokenBridge
          .connect(user)
          .bridge(
            wrappedToken.address,
            ethereumEid,
            ethereumAmount,
            user.address,
            unwrapWeth,
            options,
            refundAddress,
            { value: fee.nativeFee }
          );
      });

      it("burns wrapped tokens", async () => {
        expect(await wrappedToken.totalSupply()).to.be.eq(0);
        expect(await wrappedToken.balanceOf(user.address)).to.be.eq(0);
        expect(
          await wrappedTokenBridge.totalValueLocked(ethereumEid, weth.address)
        ).to.be.eq(0);
      });

      it("unlocks ETH", async () => {
        expect(await ethereumBridge.totalValueLockedSD(weth.address)).to.be.eq(
          0
        );
        expect(await weth.balanceOf(ethereumBridge.address)).to.be.eq(
          withdrawalFee
        );
        expect(await weth.balanceOf(user.address)).to.be.eq(0);
        expect(
          toNumber(await ethers.provider.getBalance(user.address))
        ).to.be.gt(recipientBalanceBefore);
      });
    });
  });
});
