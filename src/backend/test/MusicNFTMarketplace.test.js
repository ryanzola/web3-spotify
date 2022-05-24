const { expect } = require('chai');

const toWei = (num) => ethers.utils.parseEther(num.toString())
const fromWei = (num) => ethers.utils.formatEther(num)

describe("MusicNFTMarketplace", function() {
  let nftMarketplace;
  let deployer, artist, user1, user2, users;
  let royaltyFee = toWei(0.01);
  let URI = "https://bafybeidhjjbjonyqcahuzlpt7sznmh4xrlbspa3gstop5o47l6gsiaffee.ipfs.nftstorage.link/";
  let prices = [toWei(1), toWei(2), toWei(3), toWei(4), toWei(5), toWei(6), toWei(7), toWei(8)]
  let deploymentFees = toWei(prices.length * 0.01)
  
  beforeEach(async function() {
    // Get the ContractFactory and Signers here
    const NFTMarketplaceFactory = await ethers.getContractFactory("MusicNFTMarketplace");
    [deployer, artist, user1, user2, ...users] = await ethers.getSigners();

    // Deploy music nft marketplace contract
    nftMarketplace = await NFTMarketplaceFactory.deploy(
      royaltyFee,
      artist.address,
      prices,
      { value: deploymentFees }
    );
  })

  describe("Deployment", function() {
    it("Should track name, symbol, URI", async function() {
      const nftName = "RyFi"
      const nftSymbol = "RZ"
      expect(await nftMarketplace.name()).to.equal(nftName);
      expect(await nftMarketplace.symbol()).to.equal(nftSymbol)
      expect(await nftMarketplace.baseURI()).to.equal(URI)
      expect(await nftMarketplace.royaltyFee()).to.equal(royaltyFee)
      expect(await nftMarketplace.artist()).to.equal(artist.address)
    });

    it("Should mint then list all the music nfts", async function() {
      expect(await nftMarketplace.balanceOf(nftMarketplace.address)).to.equal(8);
      // Get each item from the marketItems array then check fields to ensure they are correct
      await Promise.all(prices.map(async (i, indx) => {
        const item = await nftMarketplace.marketItems(indx)
        expect(item.tokenId).to.equal(indx)
        expect(item.seller).to.equal(deployer.address)
        expect(item.price).to.equal(i)
      }))
    });

    it("Ether balance should equal deployment fees", async function() {
      expect(await ethers.provider.getBalance(nftMarketplace.address)).to.equal(deploymentFees)
    })
  });
  // Deployment

  describe("Updating royalty fee", function() {
    it("Only the deployer should be able to update the royalty fee", async function() {
      const fee = toWei(0.02)
      await nftMarketplace.updateRoyaltyFee(fee)
      expect(
        nftMarketplace.connect(user1).updateRoyaltyFee(fee)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      expect(await nftMarketplace.royaltyFee()).to.equal(fee);
    })
  })
  // Updating royalty fee

  describe("Buying tokens", function() {
    it("Should update the seller to zero address, transfer NFT, pay seller, pay royalty to artist, and emit a MarketItemBought event", async function() {
      const deployerInitialEthBal = await deployer.getBalance()
      const artistInitialEthBal = await artist.getBalance()

      // user 1 purchases the item
      await expect(nftMarketplace.connect(user1).buyToken(0, { value: prices[0] }))
        .to.emit(nftMarketplace, "MarketItemBought")
        .withArgs(
          0,
          deployer.address,
          user1.address,
          prices[0]
        )

        const deployerFinalEthBal = await deployer.getBalance()
        const artistFinalEthBal = await artist.getBalance()

        // Item seller should be zero address
        expect((await nftMarketplace.marketItems(0)).seller).to.equal("0x0000000000000000000000000000000000000000")
        // seller should receive payment for the price of the nft sold
        expect(+fromWei(deployerFinalEthBal)).to.equal(+fromWei(prices[0]) + +fromWei(deployerInitialEthBal))
        // artist should receive royalty
        expect(+fromWei(artistFinalEthBal)).to.equal(+fromWei(royaltyFee) + +fromWei(artistInitialEthBal))
        // buyer should now be the owner of the nft
        expect(await nftMarketplace.ownerOf(0)).to.equal(user1.address)
    })

    it("Should fail when ether amount sent with transaction does not equal asking price", async function() {
      // fails when ether sent does not equal the asking price
      await expect(
        nftMarketplace.connect(user1).buyToken(0, { value: prices[1] })
      ).to.be.revertedWith("Please send the asking price in order to complete the purchase.")
    })
  })
  // Buying tokens

  describe("Reselling tokens", function() {
    beforeEach(async function() {
      // user1 purchases and item
      await nftMarketplace.connect(user1).buyToken(0, { value: prices[0] })
    })

    it("Should track the resale item, increment the ether bal by royalty fee, transfer nft to marketplace and emit MarketItemRelisted event", async function() {
      const resalePrice = toWei(2)
      const initialMarketBal = await ethers.provider.getBalance(nftMarketplace.address)
      expect(await nftMarketplace.connect(user1).resellToken(0, resalePrice, { value: royaltyFee }))
        .to.emit(nftMarketplace, "MarketItemRelisted")
        .withArgs(
          0,
          user1.address,
          resalePrice
        )
      const finalMarketBal = await ethers.provider.getBalance(nftMarketplace.address)
      // expect the finalMarketBal to be initial + royalty fee
      expect(+fromWei(finalMarketBal)).to.equal(+fromWei(royaltyFee) + +fromWei(initialMarketBal))
      // owner of the nft should be the marketplace
      expect(await nftMarketplace.ownerOf(0)).to.equal(nftMarketplace.address)
      // get item form items mapping and check fields to ensure they are correct
      const item = await nftMarketplace.marketItems(0)
      expect(item.tokenId).to.equal(0)
      expect(item.seller).to.equal(user1.address)
      expect(item.price).to.equal(resalePrice)
    })

    it("Should fail if price is set to zero and royalty fee is not paid", async function() {
      expect(
        nftMarketplace.connect(user1).resellToken(0, 0, { value: royaltyFee })
      ).to.be.revertedWith("Price must be greater than zero")
      
      expect(
        nftMarketplace.connect(user1).resellToken(0, toWei(1), { value: 0 })
      ).to.be.revertedWith("Must pay royalty")
    })
  })
  // Reselling tokens

  describe("Getter functions", function() {
    let soldItems = [0, 1, 4]
    let ownedByUser1 = [0, 1]
    let ownedByUser2 = [4]

    beforeEach(async function() {
      // user1 purchases item 0
      await nftMarketplace.connect(user1).buyToken(0, { value: prices[0] })
      // user 1 purchases item 1
      await nftMarketplace.connect(user1).buyToken(1, { value: prices[1] })
      // user 2 purchases item 4
      await nftMarketplace.connect(user2).buyToken(4, { value: prices[4] })
    })

    it('getAllUnsoldTokens should fetch all the marketplace items up for sale', async function() {
      const unsoldItems = await nftMarketplace.getAllUnsoldTokens()
      // check to make sure all the returned unsold items have filtered out the sold items 
      expect(unsoldItems.every(i => !unsoldItems.some(j => j === i.tokenId.toNumber()))).to.equal(true)
      // check that the length is correct
      expect(unsoldItems.length === prices.length - soldItems.length).to.equal(true)
    })

    it("getMyTokens should fetch all tokens the user owns", async function() {
      // get items owned by user 1
      let myItems = await nftMarketplace.connect(user1).getMyTokens();
      // check that the length is correct
      expect(myItems.every(i => ownedByUser1.some(j => j === i.tokenId.toNumber()))).to.equal(true)
      expect(ownedByUser1.length === myItems.length).to.equal(true);
      // get items owned by user 2
      myItems = await nftMarketplace.connect(user2).getMyTokens()
      // check that the returned items array is correct
      expect(myItems.every(i => ownedByUser2.some(j => j === i.tokenId.toNumber()))).to.equal(true)
      expect(ownedByUser2.length === myItems.length).to.equal(true)
    })
  })
})