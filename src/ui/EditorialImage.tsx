import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

/**
 * Original licensed-for-Stuora editorial assets.
 * Editorial images are not verified listings, real students, jobs, trips, or offers.
 * Keep the require() paths static so Metro bundles them on web, iOS and Android.
 */
const images = {
  Community: require('../../assets/editorial/community.webp'),
  Housing: require('../../assets/editorial/housing.webp'),
  Marketplace: require('../../assets/editorial/marketplace.webp'),
  Trips: require('../../assets/editorial/trips.webp'),
  Jobs: require('../../assets/editorial/jobs.webp'),
  Events: require('../../assets/editorial/events.webp'),
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
