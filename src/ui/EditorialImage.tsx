import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

/**
 * Editorial images are decorative category/promotional visuals, not verified
 * student posts, real jobs, real trips, or verified profile photos.
 * Five selected category photographs were provided by the project owner.
 * Their redistribution/commercial-use rights must be confirmed before GA.
 * Keep require() paths static so Metro bundles them on web, iOS and Android.
 */
const images = {
  Community: require('../../assets/editorial/community.webp'),
  Housing: require('../../assets/editorial/user-selected/housing-community.webp'),
  Marketplace: require('../../assets/editorial/user-selected/marketplace-community.webp'),
  Trips: require('../../assets/editorial/user-selected/trips-community.webp'),
  Jobs: require('../../assets/editorial/user-selected/jobs-community.webp'),
  Events: require('../../assets/editorial/user-selected/events-community.webp'),
  People: require('../../assets/editorial/people.webp'),
  EmptyHousing: require('../../assets/editorial/empty-housing.webp'),
  EmptySearch: require('../../assets/editorial/empty-search.webp'),
  EmptyMessages: require('../../assets/editorial/empty-messages.webp'),
};

export type EditorialKind = keyof typeof images;

export function EditorialImage({ kind, style, label, cover = true }: {
  kind: EditorialKind;
  style: StyleProp<ImageStyle>;
  label: string;
  cover?: boolean;
}) {
  return (
    <Image
      source={images[kind]}
      style={style}
      resizeMode={cover ? 'cover' : 'contain'}
      accessibilityLabel={label}
      accessible={true}
    />
  );
}
