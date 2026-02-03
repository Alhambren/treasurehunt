// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal PRBMath UD60x18 subset (exp + log2/ln) wrapped for swapability.
/// @dev Derived from PRBMath (MIT) with constants and implementations kept intact.
///      Inputs are bounded by protocol caps (e.g., MAP tx caps), which limits
///      exponent growth and keeps operations within safe ranges.
library MathExp {
    uint256 internal constant UNIT = 1e18;
    uint256 internal constant HALF_UNIT = 0.5e18;
    uint256 internal constant LOG2_E = 1_442695040888963407;
    uint256 internal constant EXP_MAX_INPUT = 133_084258667509499441;
    uint256 internal constant EXP2_MAX_INPUT = 192e18;

    error ExpInputTooBig(uint256 x);
    error Exp2InputTooBig(uint256 x);
    error LogInputTooSmall(uint256 x);

    function expWad(uint256 x) internal pure returns (uint256 result) {
        if (x >= EXP_MAX_INPUT) {
            revert ExpInputTooBig(x);
        }
        unchecked {
            uint256 doubleUnitProduct = x * LOG2_E;
            result = exp2Wad(doubleUnitProduct / UNIT);
        }
    }

    function exp2Wad(uint256 x) internal pure returns (uint256 result) {
        if (x >= EXP2_MAX_INPUT) {
            revert Exp2InputTooBig(x);
        }
        uint256 x_192x64 = (x << 64) / UNIT;
        result = prbExp2(x_192x64);
    }

    function lnWad(uint256 x) internal pure returns (uint256 result) {
        unchecked {
            result = (log2Wad(x) * UNIT) / LOG2_E;
        }
    }

    function log2Wad(uint256 x) internal pure returns (uint256 result) {
        if (x < UNIT) {
            revert LogInputTooSmall(x);
        }

        unchecked {
            uint256 n = msb(x / UNIT);
            uint256 resultUint = n * UNIT;
            uint256 y = x >> n;
            if (y == UNIT) {
                return resultUint;
            }

            uint256 DOUBLE_UNIT = 2e18;
            for (uint256 delta = HALF_UNIT; delta > 0; delta >>= 1) {
                y = (y * y) / UNIT;
                if (y >= DOUBLE_UNIT) {
                    resultUint += delta;
                    y >>= 1;
                }
            }
            result = resultUint;
        }
    }

    function msb(uint256 x) internal pure returns (uint256 result) {
        assembly ("memory-safe") {
            let factor := shl(7, gt(x, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF))
            x := shr(factor, x)
            result := or(result, factor)
        }
        assembly ("memory-safe") {
            let factor := shl(6, gt(x, 0xFFFFFFFFFFFFFFFF))
            x := shr(factor, x)
            result := or(result, factor)
        }
        assembly ("memory-safe") {
            let factor := shl(5, gt(x, 0xFFFFFFFF))
            x := shr(factor, x)
            result := or(result, factor)
        }
        assembly ("memory-safe") {
            let factor := shl(4, gt(x, 0xFFFF))
            x := shr(factor, x)
            result := or(result, factor)
        }
        assembly ("memory-safe") {
            let factor := shl(3, gt(x, 0xFF))
            x := shr(factor, x)
            result := or(result, factor)
        }
        assembly ("memory-safe") {
            let factor := shl(2, gt(x, 0xF))
            x := shr(factor, x)
            result := or(result, factor)
        }
        assembly ("memory-safe") {
            let factor := shl(1, gt(x, 0x3))
            x := shr(factor, x)
            result := or(result, factor)
        }
        assembly ("memory-safe") {
            let factor := gt(x, 0x1)
            result := or(result, factor)
        }
    }

    function prbExp2(uint256 x) internal pure returns (uint256 result) {
        unchecked {
            result = 0x800000000000000000000000000000000000000000000000;
            if (x & 0xFF00000000000000 > 0) {
                if (x & 0x8000000000000000 > 0) {
                    result = (result * 0x16A09E667F3BCC909) >> 64;
                }
                if (x & 0x4000000000000000 > 0) {
                    result = (result * 0x1306FE0A31B7152DF) >> 64;
                }
                if (x & 0x2000000000000000 > 0) {
                    result = (result * 0x1172B83C7D517ADCE) >> 64;
                }
                if (x & 0x1000000000000000 > 0) {
                    result = (result * 0x10B5586CF9890F62A) >> 64;
                }
                if (x & 0x800000000000000 > 0) {
                    result = (result * 0x1059B0D31585743AE) >> 64;
                }
                if (x & 0x400000000000000 > 0) {
                    result = (result * 0x102C9A3E778060EE7) >> 64;
                }
                if (x & 0x200000000000000 > 0) {
                    result = (result * 0x10163DA9FB33356D8) >> 64;
                }
                if (x & 0x100000000000000 > 0) {
                    result = (result * 0x100B1AFA5ABCBED61) >> 64;
                }
            }
            if (x & 0xFF000000000000 > 0) {
                if (x & 0x80000000000000 > 0) {
                    result = (result * 0x10058C86DA1C09EA2) >> 64;
                }
                if (x & 0x40000000000000 > 0) {
                    result = (result * 0x1002C605E2E8CEC50) >> 64;
                }
                if (x & 0x20000000000000 > 0) {
                    result = (result * 0x100162F3904051FA1) >> 64;
                }
                if (x & 0x10000000000000 > 0) {
                    result = (result * 0x1000B175EFFDC76BA) >> 64;
                }
                if (x & 0x8000000000000 > 0) {
                    result = (result * 0x100058BA01FB9F96D) >> 64;
                }
                if (x & 0x4000000000000 > 0) {
                    result = (result * 0x10002C5CC37DA9492) >> 64;
                }
                if (x & 0x2000000000000 > 0) {
                    result = (result * 0x1000162E525EE0547) >> 64;
                }
                if (x & 0x1000000000000 > 0) {
                    result = (result * 0x10000B17255775C04) >> 64;
                }
            }
            if (x & 0xFF0000000000 > 0) {
                if (x & 0x800000000000 > 0) {
                    result = (result * 0x1000058B91B5BC9AE) >> 64;
                }
                if (x & 0x400000000000 > 0) {
                    result = (result * 0x100002C5C89D5EC6D) >> 64;
                }
                if (x & 0x200000000000 > 0) {
                    result = (result * 0x10000162E43F4F831) >> 64;
                }
                if (x & 0x100000000000 > 0) {
                    result = (result * 0x100000B1721BCFC9A) >> 64;
                }
                if (x & 0x80000000000 > 0) {
                    result = (result * 0x10000058B90CF1E6E) >> 64;
                }
                if (x & 0x40000000000 > 0) {
                    result = (result * 0x1000002C5C863B73F) >> 64;
                }
                if (x & 0x20000000000 > 0) {
                    result = (result * 0x100000162E430E5A2) >> 64;
                }
                if (x & 0x10000000000 > 0) {
                    result = (result * 0x1000000B172183551) >> 64;
                }
            }
            if (x & 0xFF00000000 > 0) {
                if (x & 0x8000000000 > 0) {
                    result = (result * 0x100000058B90C0B49) >> 64;
                }
                if (x & 0x4000000000 > 0) {
                    result = (result * 0x10000002C5C8601CC) >> 64;
                }
                if (x & 0x2000000000 > 0) {
                    result = (result * 0x1000000162E42FFF0) >> 64;
                }
                if (x & 0x1000000000 > 0) {
                    result = (result * 0x10000000B17217FBB) >> 64;
                }
                if (x & 0x800000000 > 0) {
                    result = (result * 0x1000000058B90BFCE) >> 64;
                }
                if (x & 0x400000000 > 0) {
                    result = (result * 0x100000002C5C85FE3) >> 64;
                }
                if (x & 0x200000000 > 0) {
                    result = (result * 0x10000000162E42FF1) >> 64;
                }
                if (x & 0x100000000 > 0) {
                    result = (result * 0x100000000B17217F8) >> 64;
                }
            }
            if (x & 0xFF000000 > 0) {
                if (x & 0x80000000 > 0) {
                    result = (result * 0x10000000058B90BFC) >> 64;
                }
                if (x & 0x40000000 > 0) {
                    result = (result * 0x1000000002C5C85FE) >> 64;
                }
                if (x & 0x20000000 > 0) {
                    result = (result * 0x100000000162E42FF) >> 64;
                }
                if (x & 0x10000000 > 0) {
                    result = (result * 0x1000000000B17217F) >> 64;
                }
                if (x & 0x8000000 > 0) {
                    result = (result * 0x100000000058B90C0) >> 64;
                }
                if (x & 0x4000000 > 0) {
                    result = (result * 0x10000000002C5C860) >> 64;
                }
                if (x & 0x2000000 > 0) {
                    result = (result * 0x1000000000162E430) >> 64;
                }
                if (x & 0x1000000 > 0) {
                    result = (result * 0x10000000000B17218) >> 64;
                }
            }
            if (x & 0xFF0000 > 0) {
                if (x & 0x800000 > 0) {
                    result = (result * 0x1000000000058B90C) >> 64;
                }
                if (x & 0x400000 > 0) {
                    result = (result * 0x100000000002C5C86) >> 64;
                }
                if (x & 0x200000 > 0) {
                    result = (result * 0x10000000000162E43) >> 64;
                }
                if (x & 0x100000 > 0) {
                    result = (result * 0x100000000000B1721) >> 64;
                }
                if (x & 0x80000 > 0) {
                    result = (result * 0x10000000000058B91) >> 64;
                }
                if (x & 0x40000 > 0) {
                    result = (result * 0x1000000000002C5C8) >> 64;
                }
                if (x & 0x20000 > 0) {
                    result = (result * 0x100000000000162E4) >> 64;
                }
                if (x & 0x10000 > 0) {
                    result = (result * 0x1000000000000B172) >> 64;
                }
            }
            if (x & 0xFF00 > 0) {
                if (x & 0x8000 > 0) {
                    result = (result * 0x100000000000058B9) >> 64;
                }
                if (x & 0x4000 > 0) {
                    result = (result * 0x10000000000002C5D) >> 64;
                }
                if (x & 0x2000 > 0) {
                    result = (result * 0x1000000000000162E) >> 64;
                }
                if (x & 0x1000 > 0) {
                    result = (result * 0x10000000000000B17) >> 64;
                }
                if (x & 0x800 > 0) {
                    result = (result * 0x1000000000000058C) >> 64;
                }
                if (x & 0x400 > 0) {
                    result = (result * 0x100000000000002C6) >> 64;
                }
                if (x & 0x200 > 0) {
                    result = (result * 0x10000000000000163) >> 64;
                }
                if (x & 0x100 > 0) {
                    result = (result * 0x100000000000000B1) >> 64;
                }
            }
            if (x & 0xFF > 0) {
                if (x & 0x80 > 0) {
                    result = (result * 0x10000000000000059) >> 64;
                }
                if (x & 0x40 > 0) {
                    result = (result * 0x1000000000000002C) >> 64;
                }
                if (x & 0x20 > 0) {
                    result = (result * 0x10000000000000016) >> 64;
                }
                if (x & 0x10 > 0) {
                    result = (result * 0x1000000000000000B) >> 64;
                }
                if (x & 0x8 > 0) {
                    result = (result * 0x10000000000000006) >> 64;
                }
                if (x & 0x4 > 0) {
                    result = (result * 0x10000000000000003) >> 64;
                }
                if (x & 0x2 > 0) {
                    result = (result * 0x10000000000000001) >> 64;
                }
                if (x & 0x1 > 0) {
                    result = (result * 0x10000000000000001) >> 64;
                }
            }
            result *= UNIT;
            result >>= (191 - (x >> 64));
        }
    }
}
