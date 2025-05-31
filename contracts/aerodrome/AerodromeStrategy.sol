// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {StrategyOwner} from "../extensions/StrategyOwner.sol";
import {IWrappedNative} from "../interfaces/IWrappedNative.sol";

import {IUniversalRouter} from "../interfaces/aerodrome/IUniversalRouter.sol";
import {INonfungiblePositionManager_Aero} from "../interfaces/aerodrome/INonfungiblePositionManager_Aero.sol";
import {ICLPool} from "../interfaces/aerodrome/ICLPool.sol";
import {ICLGauge} from "../interfaces/aerodrome/ICLGauge.sol";
import {ICLFactory} from "../interfaces/aerodrome/ICLFactory.sol";

contract AerodromeStrategy is UUPSUpgradeable, ERC721Holder, StrategyOwner {
    using SafeERC20 for IERC20;

    struct AddLiquidityParams {
        address pool;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
    }

    struct RemoveLiquidityParams {
        address pool;
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
    }

    struct SwapParam {
        bytes path;
        uint256 amountInOut;
        uint256 amountOutMinInMax;
        bool isExactIn;
    }

    struct OrderParam {
        bytes path;
        uint256 amountIn;
        uint256 amountOut;
        bool isExactIn;
    }

    struct PoolOrderParam {
        address pool;
        uint256 amountIn;
        uint256 amountOut;
        bool isExactIn;
        bool reverse;
    }

    struct ExposureOrderParams {
        address pool;
        address principalToken;
        uint256 principalAmount;
        uint256 thresholdRatioX1000;
        uint256 limitRatioX1000;
    }

    uint256 public constant PATH_LENGTH = 43;
    address internal constant _NATIVE = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    IUniversalRouter public immutable router;
    INonfungiblePositionManager_Aero public immutable nftPositionManager;
    ICLFactory public immutable clFactory;

    /// @notice Immutable address for recording wrapped native address such as WETH on Ethereum
    IWrappedNative public immutable wrappedNative;

    address public immutable withdrawAddress1;
    address public immutable withdrawAddress2;

    /// @notice whitelisted pools and tokens for trading
    mapping(address => bool) public whitelistedPools;
    mapping(address => bool) public whitelistedTokens;
    address[] public arrBeenWhitelistedPools;
    address[] public arrBeenWhitelistedTokens;

    uint256 public lastTransferGasTime;
    uint256 public dailyGasAmount;

    event PoolApproved(address indexed pool, bool revoke);

    modifier onlyWhitelistedPool(address pool) {
        require(whitelistedPools[pool], "Not whitelisted pool");
        _;
    }

    constructor(
        address _admin,
        address _trader,
        address _backupTrader,
        address _wrappedNative,
        address _router,
        address _nftPositionManager,
        address _clFactory,
        address _withdrawAddress1,
        address _withdrawAddress2
    ) StrategyOwner(_admin, _trader, _backupTrader) initializer {
        wrappedNative = IWrappedNative(_wrappedNative);
        router = IUniversalRouter(_router);
        nftPositionManager = INonfungiblePositionManager_Aero(_nftPositionManager);
        clFactory = ICLFactory(_clFactory);
        withdrawAddress1 = _withdrawAddress1;
        withdrawAddress2 = _withdrawAddress2;
    }

    function initialize() public initializer {
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address) internal override onlyAdmin {}

    fallback() external payable {}

    receive() external payable {}

    function setDailyGasLimit(uint256 amount) external onlyAdmin {
        dailyGasAmount = amount;
    }

    function getDailyGas() external onlyTrader {
        require(block.timestamp >= lastTransferGasTime + 1 days, "You can only transfer gas once a day");
        lastTransferGasTime = block.timestamp;

        _transferNativeToken(msg.sender, dailyGasAmount);
    }

    function withdrawToAddress1(address token, uint256 amount) external onlyApprovedSender {
        _withdrawToWithdrawAddress(withdrawAddress1, token, amount);
    }

    function withdrawToAddress2(address token, uint256 amount) external onlyApprovedSender {
        _withdrawToWithdrawAddress(withdrawAddress2, token, amount);
    }

    /// @notice Give or revoke token approval to Aerodrome's router, nftPositionManager, gauge
    function approvePools(address[] memory pools, bool revoke) external onlyAdmin {
        uint256 len = pools.length;
        require(len <= 10, "!2much");
        uint256 maxIntAmount = type(uint256).max;
        address routerAddress = address(router);
        address farmerAddress = address(nftPositionManager);
        for (uint256 i; i < len; ++i) {
            ICLPool pool = ICLPool(pools[i]);
            address _nft = pool.nft();
            require(_nft == address(farmerAddress), "invalid nft");
            address _gauge = pool.gauge();

            IERC20 token0 = IERC20(pool.token0());
            IERC20 token1 = IERC20(pool.token1());
            IERC721 nft = IERC721(_nft);

            _recordWhitelistedInfos(address(pool), address(token0), address(token1), revoke);

            if (revoke) {
                token0.approve(routerAddress, 0);
                token1.approve(routerAddress, 0);
                token0.approve(farmerAddress, 0);
                token1.approve(farmerAddress, 0);
                nft.setApprovalForAll(_gauge, false);
            } else {
                // approve router
                token0.approve(routerAddress, maxIntAmount);
                token1.approve(routerAddress, maxIntAmount);

                // approve farmer
                token0.approve(farmerAddress, maxIntAmount);
                token1.approve(farmerAddress, maxIntAmount);

                // approve gauge
                nft.setApprovalForAll(_gauge, true);
            }
            emit PoolApproved(address(pool), revoke);
        }
    }

    function getWhitelistedPools() public view returns (address[] memory) {
        address[] memory ret = new address[](arrBeenWhitelistedPools.length);
        address[] memory addedAddresses = new address[](arrBeenWhitelistedPools.length);
        uint256 retIndex = 0;

        for (uint256 i = 0; i < arrBeenWhitelistedPools.length; ++i) {
            address pool = arrBeenWhitelistedPools[i];
            bool alreadyAdded = false;

            // Use addedAddresses to avoid duplicate pool address in return array
            for (uint256 j = 0; j < retIndex; ++j) {
                if (addedAddresses[j] == pool) {
                    alreadyAdded = true;
                    break;
                }
            }

            if (whitelistedPools[pool] && !alreadyAdded) {
                ret[retIndex] = pool;
                addedAddresses[retIndex] = pool;
                retIndex++;
            }
        }

        // Real return array
        address[] memory trimmedRet = new address[](retIndex);
        for (uint256 i = 0; i < retIndex; ++i) {
            trimmedRet[i] = ret[i];
        }
        return trimmedRet;
    }

    function getWhitelistedTokens() public view returns (address[] memory) {
        address[] memory ret = new address[](arrBeenWhitelistedTokens.length);
        address[] memory addedAddresses = new address[](arrBeenWhitelistedTokens.length);
        uint256 retIndex = 0;

        for (uint256 i = 0; i < arrBeenWhitelistedTokens.length; ++i) {
            address token = arrBeenWhitelistedTokens[i];
            bool alreadyAdded = false;

            // Use addedAddresses to avoid duplicate token address in return array
            for (uint256 j = 0; j < retIndex; ++j) {
                if (addedAddresses[j] == token) {
                    alreadyAdded = true;
                    break;
                }
            }

            if (whitelistedTokens[token] && !alreadyAdded) {
                ret[retIndex] = token;
                addedAddresses[retIndex] = token;
                retIndex++;
            }
        }

        // Real return array
        address[] memory trimmedRet = new address[](retIndex);
        for (uint256 i = 0; i < retIndex; ++i) {
            trimmedRet[i] = ret[i];
        }
        return trimmedRet;
    }

    function wrap(uint256 amount) public onlyTrader {
        wrappedNative.deposit{value: amount}();
    }

    function unwrap(uint256 amount) public onlyTrader {
        _unwrap(amount);
    }

    function addLiquidity(
        AddLiquidityParams memory param
    )
        external
        payable
        onlyTrader
        onlyWhitelistedPool(param.pool)
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        ICLPool pool = ICLPool(param.pool);
        INonfungiblePositionManager_Aero.MintParams memory mintParam = INonfungiblePositionManager_Aero.MintParams({
            token0: pool.token0(),
            token1: pool.token1(),
            tickSpacing: pool.tickSpacing(),
            tickLower: param.tickLower,
            tickUpper: param.tickUpper,
            amount0Desired: param.amount0Desired,
            amount1Desired: param.amount1Desired,
            amount0Min: param.amount0Min,
            amount1Min: param.amount1Min,
            recipient: address(this),
            deadline: block.timestamp,
            sqrtPriceX96: 0
        });

        (tokenId, liquidity, amount0, amount1) = nftPositionManager.mint(mintParam);

        // Stake token
        ICLGauge(pool.gauge()).deposit(tokenId);
    }

    function removeLiquidity(
        RemoveLiquidityParams memory param
    ) public onlyTrader returns (uint256 amount0, uint256 amount1) {
        ICLPool _pool = ICLPool(param.pool);
        ICLGauge(_pool.gauge()).withdraw(param.tokenId);

        (amount0, amount1) = nftPositionManager.decreaseLiquidity(
            INonfungiblePositionManager_Aero.DecreaseLiquidityParams({
                tokenId: param.tokenId,
                liquidity: param.liquidity,
                amount0Min: param.amount0Min,
                amount1Min: param.amount1Min,
                deadline: block.timestamp
            })
        );

        nftPositionManager.collect(
            INonfungiblePositionManager_Aero.CollectParams({
                tokenId: param.tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        _burnTokenId(param.tokenId);
    }

    function removeLiquidityAndCloseExposure(
        RemoveLiquidityParams calldata param,
        ExposureOrderParams calldata exposureOrder
    )
        external
        onlyTrader
        returns (uint256 amount0, uint256 amount1, uint256 exposureAmount, uint256 exposureOrderAmount)
    {
        (amount0, amount1) = removeLiquidity(param);
        (exposureAmount, exposureOrderAmount) = createExposureOrder(exposureOrder);
    }

    function createOrder(OrderParam memory param) public onlyTrader {
        require(_isWhitelistedPath(param.path), "Path not allowed");

        SwapParam memory swapParams;
        if (param.isExactIn) {
            swapParams = SwapParam({
                path: param.path,
                amountInOut: param.amountIn,
                amountOutMinInMax: param.amountOut,
                isExactIn: param.isExactIn
            });
        } else {
            swapParams = SwapParam({
                path: param.path,
                amountInOut: param.amountOut,
                amountOutMinInMax: param.amountIn,
                isExactIn: param.isExactIn
            });
        }
        _createOrder(swapParams);
    }

    function createPoolOrder(PoolOrderParam calldata param) external onlyTrader onlyWhitelistedPool(param.pool) {
        ICLPool pool = ICLPool(param.pool);
        address token0 = pool.token0();
        address token1 = pool.token1();
        int24 tickSpacing = pool.tickSpacing();
        bytes memory path;
        if (param.reverse) {
            path = abi.encodePacked(token1, tickSpacing, token0);
        } else {
            path = abi.encodePacked(token0, tickSpacing, token1);
        }
        OrderParam memory orderParam = OrderParam({
            path: path,
            amountIn: param.amountIn,
            amountOut: param.amountOut,
            isExactIn: param.isExactIn
        });
        createOrder(orderParam);
    }

    function createExposureOrder(
        ExposureOrderParams calldata param
    ) public onlyTrader onlyWhitelistedPool(param.pool) returns (uint256 exposureAmount, uint256 orderAmount) {
        require(param.principalAmount > 0, "Invalid baseAmount");
        require(param.limitRatioX1000 <= 1000, "Invalid orderLimit");
        ICLPool pool = ICLPool(param.pool);
        address token0 = pool.token0();
        address token1 = pool.token1();
        uint256 token0Bal = IERC20(token0).balanceOf(address(this));
        uint256 token1Bal = IERC20(token1).balanceOf(address(this));
        OrderParam memory orderParam;
        bool token0AsPrincipal = token0 == param.principalToken;
        bool isReverse;
        if (token0AsPrincipal) {
            if (token0Bal > param.principalAmount) {
                exposureAmount = token0Bal - param.principalAmount;
                orderParam.isExactIn = true;
            } else {
                exposureAmount = param.principalAmount - token0Bal;
            }
            isReverse = token0 > token1;
        } else {
            require(token1 == param.principalToken, "Invalid baseToken");
            if (token1Bal > param.principalAmount) {
                exposureAmount = token1Bal - param.principalAmount;
                orderParam.isExactIn = true;
            } else {
                exposureAmount = param.principalAmount - token1Bal;
            }
            isReverse = token0 < token1;
        }
        uint256 exposureRatio = (exposureAmount * 1000) / param.principalAmount;
        if (exposureRatio < param.thresholdRatioX1000) {
            return (exposureAmount, 0);
        }
        if (exposureRatio > param.limitRatioX1000) {
            orderAmount = (param.limitRatioX1000 * param.principalAmount) / 1000;
        } else {
            orderAmount = exposureAmount;
        }
        if (orderParam.isExactIn) {
            orderParam.amountIn = orderAmount;
        } else {
            orderParam.amountOut = orderAmount;
            if (token0AsPrincipal) {
                orderParam.amountIn = token1Bal / 5;
            } else {
                orderParam.amountIn = token0Bal / 5;
            }
        }
        if (isReverse) {
            orderParam.path = abi.encodePacked(token1, pool.tickSpacing(), token0);
        } else {
            orderParam.path = abi.encodePacked(token0, pool.tickSpacing(), token1);
        }
        createOrder(orderParam);
    }

    function gaugeDeposit(ICLPool pool, uint256 tokenId) external onlyTrader onlyWhitelistedPool(address(pool)) {
        ICLGauge gauge = ICLGauge(pool.gauge());
        gauge.deposit(tokenId);
    }

    function gaugeWithdraw(ICLPool pool, uint256 tokenId) external onlyTrader onlyWhitelistedPool(address(pool)) {
        ICLGauge gauge = ICLGauge(pool.gauge());
        gauge.withdraw(tokenId);
    }

    function gaugeGetReward(ICLPool pool, uint256 tokenId) external onlyTrader onlyWhitelistedPool(address(pool)) {
        ICLGauge gauge = ICLGauge(pool.gauge());
        gauge.getReward(tokenId);
    }

    function _createOrder(SwapParam memory param) internal {
        // V3_SWAP_EXACT_IN = 0x00;
        // V3_SWAP_EXACT_OUT = 0x01;
        // WRAP_ETH = 0x0b;
        // UNWRAP_WETH = 0x0c;

        bytes memory commands = new bytes(1);
        bytes[] memory cmdInputs = new bytes[](1);

        commands[0] = param.isExactIn ? bytes1(0x00) : bytes1(0x01);
        cmdInputs[0] = abi.encode(address(this), param.amountInOut, param.amountOutMinInMax, param.path, true);

        router.execute(commands, cmdInputs, block.timestamp);
    }

    /// @dev path structure [20 bytes token0][3 bytes fee0][20 bytes token1]
    function _isWhitelistedPath(bytes memory path) internal view returns (bool) {
        require(path.length == PATH_LENGTH, "Path length mismatch"); // Only support token <-> token swapping

        address token0 = address(bytes20(path));
        bytes32 t;
        address token1;
        int24 tickSpacing;
        assembly {
            t := mload(add(path, 52)) // offset = 32 + path.length - 23
            tickSpacing := shr(232, t) // shift right 29 bytes
            token1 := shr(72, t) // shift right 9 bytes
        }

        return whitelistedPools[clFactory.getPool(token0, token1, tickSpacing)];
    }

    function _transferNativeToken(address to, uint256 amount) internal {
        (bool success, ) = to.call{value: amount}(new bytes(0));
        require(success, "Transfer native token fail");
    }

    function _recordWhitelistedInfos(address pool, address token0, address token1, bool revoke) internal {
        if (revoke) {
            whitelistedPools[pool] = false;
            whitelistedTokens[token0] = false;
            whitelistedTokens[token1] = false;
        } else {
            if (!whitelistedPools[pool]) {
                whitelistedPools[pool] = true;
                arrBeenWhitelistedPools.push(pool);
            }

            if (!whitelistedTokens[token0]) {
                whitelistedTokens[token0] = true;
                arrBeenWhitelistedTokens.push(token0);
            }

            if (!whitelistedTokens[token1]) {
                whitelistedTokens[token1] = true;
                arrBeenWhitelistedTokens.push(token1);
            }
        }
    }

    function _withdrawToWithdrawAddress(address to, address token, uint256 amount) internal {
        require(amount > 0, "Zero amount");

        if (token == _NATIVE) {
            amount = amount == type(uint256).max ? address(this).balance : amount;
            _transferNativeToken(to, amount);
        } else {
            amount = amount == type(uint256).max ? IERC20(token).balanceOf(address(this)) : amount;
            if (token == address(wrappedNative)) {
                _unwrap(amount);
                _transferNativeToken(to, amount);
            } else {
                IERC20(token).safeTransfer(to, amount);
            }
        }
    }

    function _unwrap(uint256 amount) internal {
        wrappedNative.withdraw(amount);
    }

    function _burnTokenId(uint256 tokenId) internal {
        nftPositionManager.burn(tokenId);
    }
}
