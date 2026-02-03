// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "./utils/ERC20.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {MathExp} from "./utils/MathExp.sol";

contract MapToken is ERC20, ReentrancyGuard {
    IERC20 public immutable usdc;

    uint256 public constant P0_WAD = 10_000_000_000_000_000; // 0.01 * 1e18
    uint256 public constant K_WAD = 92_103_403_719; // k * 1e18
    uint256 public constant MAX_MAP_BUY_USDC = 50_000e6;
    uint256 public constant MAX_MAP_SELL_BPS = 100;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    event MapBought(address indexed buyer, uint256 usdcIn, uint256 mapOut);
    event MapSold(address indexed seller, uint256 mapIn, uint256 usdcOut);

    constructor(address usdc_) ERC20("Treasure Map", "MAP", 18) {
        require(usdc_ != address(0), "USDC required");
        usdc = IERC20(usdc_);
    }

    function buy(uint256 usdcAmount) external nonReentrant returns (uint256 mapOut) {
        require(usdcAmount > 0, "Amount must be positive");
        require(usdcAmount <= MAX_MAP_BUY_USDC, "Buy cap exceeded");

        mapOut = getBuyPrice(usdcAmount);
        require(mapOut > 0, "Zero output");

        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "Transfer failed");
        _mint(msg.sender, mapOut);
        emit MapBought(msg.sender, usdcAmount, mapOut);
    }

    function sell(uint256 mapAmount) external nonReentrant returns (uint256 usdcOut) {
        require(mapAmount > 0, "Amount must be positive");
        uint256 maxSell = (totalSupply * MAX_MAP_SELL_BPS) / BPS_DENOMINATOR;
        require(mapAmount <= maxSell, "Sell cap exceeded");

        usdcOut = getSellProceeds(mapAmount);
        require(usdcOut > 0, "Zero output");

        _burn(msg.sender, mapAmount);
        require(usdc.transfer(msg.sender, usdcOut), "Transfer failed");
        emit MapSold(msg.sender, mapAmount, usdcOut);
    }

    function getBuyPrice(uint256 usdcAmount) public view returns (uint256 mapOut) {
        require(usdcAmount > 0, "Amount must be positive");

        uint256 supply = totalSupply;
        uint256 costWad = usdcAmount * 1e12;

        uint256 expS = _expTerm(supply);
        uint256 p0OverK = _p0OverK();
        uint256 expNew = expS + (costWad * 1e18) / p0OverK;

        uint256 kSNew = MathExp.lnWad(expNew);
        uint256 newSupply = (kSNew * 1e18) / K_WAD;

        mapOut = newSupply - supply;
    }

    function getSellProceeds(uint256 mapAmount) public view returns (uint256 usdcOut) {
        require(mapAmount > 0, "Amount must be positive");

        uint256 supply = totalSupply;
        require(mapAmount <= supply, "Amount exceeds supply");

        uint256 proceedsWad = _proceeds(supply, mapAmount);
        usdcOut = proceedsWad / 1e12;
    }

    function currentPrice() external view returns (uint256) {
        uint256 priceWad = (P0_WAD * _expTerm(totalSupply)) / 1e18;
        return priceWad / 1e12;
    }

    function _p0OverK() internal pure returns (uint256) {
        return (P0_WAD * 1e18) / K_WAD;
    }

    function _expTerm(uint256 supply) internal pure returns (uint256) {
        uint256 kS = (K_WAD * supply) / 1e18;
        return MathExp.expWad(kS);
    }

    function _cost(uint256 supply, uint256 deltaS) internal pure returns (uint256) {
        uint256 expS = _expTerm(supply);
        uint256 expSDelta = _expTerm(supply + deltaS);
        uint256 p0OverK = _p0OverK();
        return (p0OverK * (expSDelta - expS)) / 1e18;
    }

    function _proceeds(uint256 supply, uint256 deltaS) internal pure returns (uint256) {
        uint256 expS = _expTerm(supply);
        uint256 expSDelta = _expTerm(supply - deltaS);
        uint256 p0OverK = _p0OverK();
        return (p0OverK * (expS - expSDelta)) / 1e18;
    }
}
