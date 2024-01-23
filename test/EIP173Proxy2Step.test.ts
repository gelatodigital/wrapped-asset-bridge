import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

describe("EIP173Proxy2StepWithCustomReceive", function () {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let newOwner: SignerWithAddress;

  let weth9: Contract;
  let proxy2StepWithReceive: Contract;

  beforeEach(async () => {
    [deployer, owner, user, newOwner] = await ethers.getSigners();

    weth9 = await (await ethers.getContractFactory("WETH9")).deploy();

    proxy2StepWithReceive = await (
      await ethers.getContractFactory("EIP173Proxy2StepWithCustomReceive")
    ).deploy(weth9.address, owner.address, "0x");
  });

  it("owner set correctly", async () => {
    expect(await proxy2StepWithReceive.owner()).to.be.eql(owner.address);
  });

  describe("transferOwnership", function () {
    it("set pending owner", async () => {
      await proxy2StepWithReceive
        .connect(owner)
        .transferOwnership(newOwner.address);

      expect(await proxy2StepWithReceive.pendingOwner()).to.be.eql(
        newOwner.address
      );
    });

    it("reverts when non owner initiate ownership transfer", async () => {
      await expect(
        proxy2StepWithReceive.connect(user).transferOwnership(newOwner.address)
      ).to.be.revertedWith("NOT_AUTHORIZED");
    });
  });

  describe("acceptOwnership", function () {
    beforeEach(async () => {
      await proxy2StepWithReceive
        .connect(owner)
        .transferOwnership(newOwner.address);
    });

    it("pending owner can accept ownership", async () => {
      await proxy2StepWithReceive.connect(newOwner).acceptOwnership();

      expect(await proxy2StepWithReceive.owner()).to.be.eql(newOwner.address);
    });

    it("pending owner is cleared after ownership transferred", async () => {
      await proxy2StepWithReceive.connect(newOwner).acceptOwnership();

      expect(await proxy2StepWithReceive.pendingOwner()).to.be.eql(
        ethers.constants.AddressZero
      );
    });

    it("reverts when non pending owner accepts ownership", async () => {
      await expect(
        proxy2StepWithReceive.connect(user).acceptOwnership()
      ).to.be.revertedWith("NOT_PENDING_OWNER");
    });
  });

  describe("receive", function () {
    let wethProxy: Contract;

    beforeEach(async () => {
      wethProxy = await ethers.getContractAt(
        "WETH9",
        proxy2StepWithReceive.address
      );
    });

    it("receive should fallback to implementation", async () => {
      expect(
        await user.sendTransaction({
          to: wethProxy.address,
          value: ethers.utils.parseEther("1"),
        })
      ).to.emit(wethProxy, "Deposit");

      expect(await wethProxy.balanceOf(user.address)).to.be.eql(
        ethers.utils.parseEther("1")
      );
    });
  });
});
